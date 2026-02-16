require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { 
    Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, 
    EmbedBuilder, InteractionType, REST, Routes, SlashCommandBuilder,
    PermissionFlagsBits
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// File lưu trữ dữ liệu
const DATA_FILE = path.join(__dirname, 'pollData.json');

// Hàm load dữ liệu từ file
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            botConfig = data.botConfig || { adminChannel: null };
            // Chuyển object thành Map
            if (data.pollStats) {
                Object.keys(data.pollStats).forEach(key => {
                    pollStats.set(key, data.pollStats[key]);
                });
            }
            console.log('✅ Đã load dữ liệu từ file');
        }
    } catch (error) {
        console.error('Lỗi khi load dữ liệu:', error);
    }
}

// Hàm lưu dữ liệu vào file
function saveData() {
    try {
        const data = {
            botConfig,
            pollStats: Object.fromEntries(pollStats), // Chuyển Map thành object
            lastUpdate: new Date().toISOString()
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Lỗi khi lưu dữ liệu:', error);
    }
}

// Hàm lấy ngày Chủ nhật cuối cùng
function getLastSunday() {
    const now = new Date();
    const day = now.getDay(); // 0 = Chủ nhật, 1 = Thứ 2, ...
    const diff = day === 0 ? 0 : day; // Nếu hôm nay là CN thì 0, không thì lấy số ngày từ CN
    const lastSunday = new Date(now);
    lastSunday.setDate(now.getDate() - diff);
    lastSunday.setHours(0, 0, 0, 0);
    return lastSunday.getTime();
}

// Hàm kiểm tra và reset vote tuần mới
function checkAndResetWeekly() {
    const currentWeekStart = getLastSunday();
    
    pollStats.forEach((stats, pollId) => {
        if (!stats.lastReset || stats.lastReset < currentWeekStart) {
            // Reset vote cho tuần mới
            stats.users = [];
            stats.count1 = 0;
            stats.count2 = 0;
            stats.lastReset = currentWeekStart;
            console.log(`🔄 Reset poll ${pollId} cho tuần mới`);
        }
    });
    
    saveData();
}

// Lưu trữ dữ liệu
let botConfig = { adminChannel: null };
const pollStats = new Map();
const systemLogs = []; // Lưu lại các hoạt động gần đây của bot

// Load dữ liệu khi khởi động
loadData();
checkAndResetWeekly(); // Kiểm tra và reset nếu cần

// Kiểm tra reset mỗi 1 giờ
setInterval(() => {
    checkAndResetWeekly();
}, 60 * 60 * 1000); // 1 giờ

// --- 1. ĐĂNG KÝ SLASH COMMANDS ---
const commands = [
    // Lệnh /poll
    new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Tạo poll biểu quyết')
        .addSubcommand(sub =>
            sub.setName('create')
               .setDescription('Tạo poll mới')
               .addStringOption(opt => opt.setName('title').setDescription('Tiêu đề').setRequired(true))
               .addStringOption(opt => opt.setName('op1').setDescription('Lựa chọn 1').setRequired(true))
               .addStringOption(opt => opt.setName('op2').setDescription('Lựa chọn 2').setRequired(true))
        ),
    // Lệnh /help
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Xem hướng dẫn sử dụng bot'),
    // Lệnh /channel
    new SlashCommandBuilder()
        .setName('channel')
        .setDescription('Cài đặt kênh nhận log cho Admin')
        .addChannelOption(opt => opt.setName('select').setDescription('Chọn kênh log').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    // Lệnh /log
    new SlashCommandBuilder()
        .setName('log')
        .setDescription('Xem lịch sử hoạt động của bot')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    // Lệnh /admin
    new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Bảng điều khiển quản trị bot')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Đã cập nhật hệ thống lệnh Slash');
    } catch (e) { console.error(e); }
})();

// --- 2. XỬ LÝ TƯƠNG TÁC ---
client.on('interactionCreate', async (interaction) => {
    
    // Ghi log hệ thống cho mỗi tương tác
    if (interaction.isCommand()) systemLogs.push(`[${new Date().toLocaleTimeString()}] ${interaction.user.tag} dùng lệnh /${interaction.commandName}`);

    // XỬ LÝ LỆNH SLASH
    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;

        if (commandName === 'help') {
            const helpEmbed = new EmbedBuilder()
                .setTitle('📖 Hướng dẫn sử dụng Bot Poll')
                .setColor(0x3498db)
                .addFields(
                    { name: '`/poll create`', value: 'Tạo một bảng biểu quyết mới với form phản hồi.' },
                    { name: '`/channel`', value: 'Thiết lập kênh để bot gửi thông báo form về cho Admin.' },
                    { name: '`/log`', value: 'Hiển thị các hoạt động hệ thống gần đây.' },
                    { name: '`/admin`', value: 'Kiểm tra trạng thái máy chủ và cấu hình bot.' }
                );
            return interaction.reply({ embeds: [helpEmbed] });
        }

        if (commandName === 'channel') {
            const channel = options.getChannel('select');
            botConfig.adminChannel = channel.id;
            saveData();
            return interaction.reply(`✅ Đã thiết lập kênh log tại: ${channel}`);
        }

        if (commandName === 'log') {
            const logContent = systemLogs.slice(-10).join('\n') || 'Chưa có hoạt động nào.';
            return interaction.reply({ content: `**Hoạt động gần đây:**\n\`\`\`${logContent}\`\`\``, ephemeral: true });
        }

        if (commandName === 'admin') {
            const adminEmbed = new EmbedBuilder()
                .setTitle('⚙️ Bot Admin Panel')
                .setColor(0x2c3e50)
                .addFields(
                    { name: 'Kênh Log hiện tại', value: botConfig.adminChannel ? `<#${botConfig.adminChannel}>` : 'Chưa thiết lập', inline: true },
                    { name: 'Tổng số Poll đã tạo', value: `${pollStats.size}`, inline: true },
                    { name: 'Trạng thái', value: '🟢 Hoạt động ổn định', inline: true }
                );
            return interaction.reply({ embeds: [adminEmbed], ephemeral: true });
        }

        if (commandName === 'poll') {
            const title = options.getString('title');
            const op1 = options.getString('op1');
            const op2 = options.getString('op2');

            // Tạo ID tạm thời trước
            const tempId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Lưu poll tạm thời trước khi reply
            const currentWeekStart = getLastSunday();
            pollStats.set(tempId, { 
                op1, op2, count1: 0, count2: 0, users: [], 
                title, channelId: interaction.channelId,
                lastReset: currentWeekStart // Lưu timestamp tuần hiện tại
            });

            const embed = new EmbedBuilder().setTitle(`📝 ${title}`).setColor(0xf1c40f)
                .addFields({ name: `1️⃣ ${op1}`, value: '0', inline: true }, { name: `2️⃣ ${op2}`, value: '0', inline: true });

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`p_1_${tempId}`).setLabel(op1).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`p_2_${tempId}`).setLabel(op2).setStyle(ButtonStyle.Secondary)
            );

            const reply = await interaction.reply({ embeds: [embed], components: [buttons], fetchReply: true });
            const pollId = reply.id;
            
            // Chuyển dữ liệu từ tempId sang pollId thật
            const pollData = pollStats.get(tempId);
            pollData.messageId = pollId;
            pollStats.delete(tempId);
            pollStats.set(pollId, pollData);
            saveData();
            
            // Cập nhật button với poll ID thật
            const newButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`p_1_${pollId}`).setLabel(op1).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`p_2_${pollId}`).setLabel(op2).setStyle(ButtonStyle.Secondary)
            );
            await reply.edit({ components: [newButtons] });
        }
    }

    // XỬ LÝ NÚT BẤM - Bỏ form, gửi thông tin trực tiếp
    if (interaction.isButton()) {
        const [ , type, pollId] = interaction.customId.split('_');
        const stats = pollStats.get(pollId);
        
        if (!stats) return interaction.reply({ content: '❌ Poll hết hạn.', ephemeral: true });
        
        // Kiểm tra và reset nếu cần
        const currentWeekStart = getLastSunday();
        if (!stats.lastReset || stats.lastReset < currentWeekStart) {
            stats.users = [];
            stats.count1 = 0;
            stats.count2 = 0;
            stats.lastReset = currentWeekStart;
            saveData();
        }
        
        if (stats.users.includes(interaction.user.id)) return interaction.reply({ content: '❌ Bạn đã vote trong tuần này rồi! Reset vào Chủ nhật.', ephemeral: true });

        // Phản hồi ngay để tránh timeout
        await interaction.deferReply({ ephemeral: true });

        try {
            // Lấy thông tin member trong server
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const displayName = member.displayName || interaction.user.username;
            const voteTime = new Date();
            
            // Cập nhật số vote
            type === '1' ? stats.count1++ : stats.count2++;
            stats.users.push(interaction.user.id);
            saveData();

            // Lấy message gốc và cập nhật Embed
            const pollMessage = await interaction.channel.messages.fetch(pollId);
            const embed = EmbedBuilder.from(pollMessage.embeds[0]);
            embed.setFields(
                { name: `1️⃣ ${stats.op1}`, value: `${stats.count1}`, inline: true },
                { name: `2️⃣ ${stats.op2}`, value: `${stats.count2}`, inline: true }
            );
            await pollMessage.edit({ embeds: [embed] });

            // Gửi thông tin user vào kênh Admin
            if (botConfig.adminChannel) {
                try {
                    const adminChan = await client.channels.fetch(botConfig.adminChannel);
                    if (adminChan) {
                        const log = new EmbedBuilder()
                            .setTitle('🔔 Vote Poll Mới')
                            .setColor(type === '1' ? 0x3498db : 0x9b59b6)
                            .addFields(
                                { name: '👤 Tên trong server', value: displayName, inline: true },
                                { name: '🆔 Username', value: interaction.user.tag, inline: true },
                                { name: '⏰ Thời gian react', value: `<t:${Math.floor(voteTime.getTime() / 1000)}:F>`, inline: false },
                                { name: '📝 Form react', value: `**${stats.title || 'Poll'}**`, inline: false },
                                { name: '✅ Lựa chọn', value: type === '1' ? `1️⃣ ${stats.op1}` : `2️⃣ ${stats.op2}`, inline: true },
                                { name: '📊 Tổng vote', value: `${stats.count1 + stats.count2}`, inline: true }
                            )
                            .setThumbnail(interaction.user.displayAvatarURL())
                            .setFooter({ text: `User ID: ${interaction.user.id} • Reset: Chủ nhật hàng tuần` })
                            .setTimestamp();
                        await adminChan.send({ embeds: [log] });
                    }
                } catch (error) {
                    console.error('Lỗi khi gửi log vào kênh admin:', error);
                }
            } else {
                console.log('⚠️ Chưa thiết lập kênh admin. Dùng lệnh /channel để cài đặt.');
            }

            await interaction.editReply({ content: '✅ Đã ghi nhận vote của bạn!' });
        } catch (error) {
            console.error('Lỗi khi xử lý vote:', error);
            await interaction.editReply({ content: '❌ Có lỗi xảy ra. Vui lòng thử lại.' });
        }
    }
});

client.login(TOKEN);