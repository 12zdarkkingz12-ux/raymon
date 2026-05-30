require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ApplicationCommandType,
  StickerFormatType,
} = require('discord.js');
const express = require('express');
const fs      = require('fs');
const path    = require('path');

const TOKEN         = process.env.TOKEN;
const CLIENT_ID     = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI  = process.env.REDIRECT_URI;
const OWNER_ID      = process.env.OWNER_ID;
const PORT          = process.env.PORT || 3000;

// ─────────────────────────────────────────
//  Whitelist — حفظ وقراءة من ملف JSON
// ─────────────────────────────────────────
const WL_FILE = path.join(__dirname, 'whitelist.json');

function loadWL() {
  if (!fs.existsSync(WL_FILE)) fs.writeFileSync(WL_FILE, '[]');
  return JSON.parse(fs.readFileSync(WL_FILE, 'utf8'));
}
function saveWL(list) {
  fs.writeFileSync(WL_FILE, JSON.stringify(list, null, 2));
}
function isAllowed(userId) {
  return userId === OWNER_ID || loadWL().includes(userId);
}
function addUser(userId) {
  const list = loadWL();
  if (!list.includes(userId)) { list.push(userId); saveWL(list); return true; }
  return false;
}
function removeUser(userId) {
  const list = loadWL().filter(id => id !== userId);
  saveWL(list);
}

// ─────────────────────────────────────────
//  تعريف الأوامر
// ─────────────────────────────────────────
const commands = [
  // قائمة السياق — رسائل
  { name: 'Copy Emojis', type: ApplicationCommandType.Message },
  { name: 'Copy Sticker', type: ApplicationCommandType.Message },
  { name: 'Copy Audio',   type: ApplicationCommandType.Message },

  // قائمة السياق — مستخدمين
  { name: 'Copy Avatar', type: ApplicationCommandType.User },
  { name: 'Copy Banner', type: ApplicationCommandType.User },

  // Slash Commands
  {
    name: 'steal',
    description: 'اسرق محتوى من ديسكورد مباشرة',
    options: [{
      name: 'emoji',
      description: 'اسرق إيموجي عن طريق لصقه هنا',
      type: 1,
      options: [{ name: 'target', description: 'الإيموجي المراد نسخه', type: 3, required: true }],
    }],
  },
  {
    name: 'approve',
    description: '✅ [أونر] أضف مستخدم للوايت لست',
    options: [{ name: 'user_id', description: 'الـ ID الخاص بالمستخدم', type: 3, required: true }],
  },
  {
    name: 'remove',
    description: '❌ [أونر] أزل مستخدم من الوايت لست',
    options: [{ name: 'user_id', description: 'الـ ID الخاص بالمستخدم', type: 3, required: true }],
  },
  {
    name: 'whitelist',
    description: '📋 [أونر] عرض كل المستخدمين في الوايت لست',
  },
];

// ─────────────────────────────────────────
//  إنشاء الكلايانت
// ─────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', async () => {
  console.log(`✅ Raymon شغّال! مسجّل كـ ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ تم تسجيل الأوامر بنجاح');
  } catch (err) {
    console.error('❌ فشل تسجيل الأوامر:', err);
  }
});

// ─────────────────────────────────────────
//  معالجة التفاعلات
// ─────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {

  // ══ أوامر الأونر (بدون فحص وايت لست) ══

  if (interaction.isChatInputCommand() && interaction.commandName === 'approve') {
    if (interaction.user.id !== OWNER_ID)
      return interaction.reply({ content: '❌ هذا الأمر للأونر فقط.', ephemeral: true });
    const userId = interaction.options.getString('user_id');
    const added  = addUser(userId);
    return interaction.reply({
      content: added ? `✅ تم إضافة \`${userId}\` للوايت لست.` : `⚠️ \`${userId}\` موجود أصلاً.`,
      ephemeral: true,
    });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'remove') {
    if (interaction.user.id !== OWNER_ID)
      return interaction.reply({ content: '❌ هذا الأمر للأونر فقط.', ephemeral: true });
    const userId = interaction.options.getString('user_id');
    removeUser(userId);
    return interaction.reply({ content: `✅ تم إزالة \`${userId}\` من الوايت لست.`, ephemeral: true });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'whitelist') {
    if (interaction.user.id !== OWNER_ID)
      return interaction.reply({ content: '❌ هذا الأمر للأونر فقط.', ephemeral: true });
    const list = loadWL();
    const text = list.length
      ? `📋 **الوايت لست (${list.length}):**\n` + list.map(id => `• \`${id}\``).join('\n')
      : '📋 الوايت لست فاضية.';
    return interaction.reply({ content: text, ephemeral: true });
  }

  // ══ فحص الصلاحية لكل الأوامر الثانية ══
  if (!isAllowed(interaction.user.id))
    return interaction.reply({
      content: '❌ ما عندك صلاحية. سجّل دخولك أولاً من الرابط الرسمي.',
      ephemeral: true,
    });

  // ══ Copy Emojis ══
  if (interaction.isMessageContextMenuCommand() && interaction.commandName === 'Copy Emojis') {
    const found = [...interaction.targetMessage.content.matchAll(/<(a?):(\w+):(\d+)>/g)];
    if (!found.length)
      return interaction.reply({ content: '❌ ما في إيموجيات مخصصة في هذي الرسالة.', ephemeral: true });
    const links = found.map(m => {
      const ext = m[1] === 'a' ? 'gif' : 'png';
      return `**${m[2]}** → https://cdn.discordapp.com/emojis/${m[3]}.${ext}?size=512`;
    });
    return interaction.reply({ content: links.join('\n'), ephemeral: true });
  }

  // ══ Copy Sticker ══
  if (interaction.isMessageContextMenuCommand() && interaction.commandName === 'Copy Sticker') {
    const sticker = interaction.targetMessage.stickers.first();
    if (!sticker)
      return interaction.reply({ content: '❌ ما في ستكر في هذي الرسالة.', ephemeral: true });
    let ext = 'png';
    if (sticker.format === StickerFormatType.Lottie) ext = 'json';
    if (sticker.format === StickerFormatType.GIF)    ext = 'gif';
    return interaction.reply({
      content: `**${sticker.name}** → https://media.discordapp.net/stickers/${sticker.id}.${ext}`,
      ephemeral: true,
    });
  }

  // ══ Copy Audio ══
  if (interaction.isMessageContextMenuCommand() && interaction.commandName === 'Copy Audio') {
    const audioTypes = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/webm', 'audio/flac'];
    const files = interaction.targetMessage.attachments.filter(a =>
      audioTypes.some(t => a.contentType?.startsWith(t))
    );
    if (!files.size)
      return interaction.reply({ content: '❌ ما في ملفات صوتية في هذي الرسالة.', ephemeral: true });
    return interaction.reply({
      content: files.map(a => `**${a.name}** → ${a.url}`).join('\n'),
      ephemeral: true,
    });
  }

  // ══ Copy Avatar ══
  if (interaction.isUserContextMenuCommand() && interaction.commandName === 'Copy Avatar') {
    const user = interaction.targetUser;
    if (!user.avatar)
      return interaction.reply({ content: '❌ هذا المستخدم ما عنده أفاتار مخصص.', ephemeral: true });
    const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return interaction.reply({
      content: `**أفاتار ${user.username}** → https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=4096`,
      ephemeral: true,
    });
  }

  // ══ Copy Banner ══
  if (interaction.isUserContextMenuCommand() && interaction.commandName === 'Copy Banner') {
    const user = await interaction.targetUser.fetch({ force: true });
    if (!user.banner)
      return interaction.reply({ content: '❌ هذا المستخدم ما عنده بانر.', ephemeral: true });
    const ext = user.banner.startsWith('a_') ? 'gif' : 'png';
    return interaction.reply({
      content: `**بانر ${user.username}** → https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${ext}?size=4096`,
      ephemeral: true,
    });
  }

  // ══ /steal emoji ══
  if (interaction.isChatInputCommand() && interaction.commandName === 'steal') {
    if (interaction.options.getSubcommand() === 'emoji') {
      const input = interaction.options.getString('target');
      const match = input.match(/<(a?):(\w+):(\d+)>/);
      if (!match)
        return interaction.reply({ content: '❌ أرسل إيموجي مخصص صحيح (مو إيموجي عادي).', ephemeral: true });
      const ext = match[1] === 'a' ? 'gif' : 'png';
      return interaction.reply({
        content: `**${match[2]}** → https://cdn.discordapp.com/emojis/${match[3]}.${ext}?size=512`,
        ephemeral: true,
      });
    }
  }
});

// ─────────────────────────────────────────
//  Express Server — OAuth2
// ─────────────────────────────────────────
const app = express();

// الصفحة الرئيسية
app.get('/', (req, res) => {
  const authUrl =
    `https://discord.com/oauth2/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=identify`;

  res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>Raymon — تسجيل الدخول</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex; justify-content: center; align-items: center;
      height: 100vh; background: #1e1f22; font-family: sans-serif;
    }
    .card {
      background: #2b2d31; padding: 40px 50px; border-radius: 16px;
      text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    h1 { color: #fff; font-size: 28px; margin-bottom: 10px; }
    p  { color: #949ba4; margin-bottom: 30px; }
    a  {
      display: inline-block; background: #5865f2; color: #fff;
      padding: 14px 32px; border-radius: 8px; text-decoration: none;
      font-size: 16px; font-weight: bold; transition: background 0.2s;
    }
    a:hover { background: #4752c4; }
  </style>
</head>
<body>
  <div class="card">
    <h1>👾 Raymon</h1>
    <p>سجّل دخولك بحساب ديسكورد للحصول على صلاحية استخدام البوت</p>
    <a href="${authUrl}">تسجيل الدخول بـ Discord</a>
  </div>
</body>
</html>`);
});

// Callback من Discord
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.send('❌ فشل تسجيل الدخول، ما في كود.');

  try {
    // تبادل الكود بـ Access Token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
      }),
    });
    const { access_token } = await tokenRes.json();

    // جيب بيانات المستخدم
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const user = await userRes.json();

    // أبلّغ الأونر على الخاص
    const owner = await client.users.fetch(OWNER_ID);
    await owner.send(
      `📥 **طلب انضمام جديد لـ Raymon**\n` +
      `👤 **اليوزر:** \`${user.username}\`\n` +
      `🆔 **الـ ID:** \`${user.id}\`\n\n` +
      `للموافقة اكتب:\n\`/approve user_id:${user.id}\``
    );

    // رد للمستخدم
    res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>Raymon — تم التسجيل</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex; justify-content: center; align-items: center;
      height: 100vh; background: #1e1f22; font-family: sans-serif;
    }
    .card {
      background: #2b2d31; padding: 40px 50px; border-radius: 16px;
      text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    h1 { color: #23a55a; font-size: 26px; margin-bottom: 12px; }
    p  { color: #949ba4; font-size: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>✅ تم تسجيل دخولك يا ${user.username}!</h1>
    <p>طلبك وصل للمشرف. انتظر الموافقة قبل استخدام البوت.</p>
  </div>
</body>
</html>`);

  } catch (err) {
    console.error('❌ OAuth2 Error:', err);
    res.send('❌ حدث خطأ أثناء تسجيل الدخول، حاول مرة ثانية.');
  }
});

// ─────────────────────────────────────────
//  تشغيل كل شيء
// ─────────────────────────────────────────
app.listen(PORT, () => console.log(`🌐 السيرفر شغّال على port ${PORT}`));
client.login(TOKEN);
