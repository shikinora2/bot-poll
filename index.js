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

// Lưu trữ dữ liệu
let botConfig = { adminChannel: null };
const pollStats = new Map();
const systemLogs = []; // Lưu lại các hoạt động gần đây của bot

// Load dữ liệu khi khởi động
loadData();

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

            const embed = new EmbedBuilder().setTitle(`📝 ${title}`).setColor(0xf1c40f)
                .addFields({ name: `1️⃣ ${op1}`, value: '0', inline: true }, { name: `2️⃣ ${op2}`, value: '0', inline: true });

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`p_1_temp`).setLabel(op1).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`p_2_temp`).setLabel(op2).setStyle(ButtonStyle.Secondary)
            );

            const reply = await interaction.reply({ embeds: [embed], components: [buttons], fetchReply: true });
            const pollId = reply.id;
            
            // Lưu poll với message ID thật
            pollStats.set(pollId, { op1, op2, count1: 0, count2: 0, users: [], messageId: pollId, title, channelId: interaction.channelId });
            saveData();
            
            // Cập nhật button với poll ID đúng
            const newButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`p_1_${pollId}`).setLabel(op1).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`p_2_${pollId}`).setLabel(op2).setStyle(ButtonStyle.Secondary)
            );
            await reply.edit({ components: [newButtons] });
        }
    }

    // XỬ LÝ NÚT BẤM & MODAL (Giống như phiên bản trước nhưng thêm gửi log vào kênh đã chọn)
    if (interaction.isButton()) {
        const [ , type, pollId] = interaction.customId.split('_');
        const stats = pollStats.get(pollId);
        
        if (!stats) return interaction.reply({ content: 'Poll hết hạn.', ephemeral: true });
        if (stats.users.includes(interaction.user.id)) return interaction.reply({ content: 'Bạn đã vote rồi!', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`m_${type}_${pollId}`).setTitle('Phản hồi ý kiến');
        const input = new TextInputBuilder().setCustomId('reason').setLabel("Lý do").setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    }

    if (interaction.type === InteractionType.ModalSubmit) {
        try {
            // Phản hồi ngay lập tức để tránh timeout
            await interaction.deferReply({ ephemeral: true });

            const [ , type, pollId] = interaction.customId.split('_');
            const reason = interaction.fields.getTextInputValue('reason');
            const stats = pollStats.get(pollId);
            
            if (!stats) {
                return interaction.editReply({ content: '❌ Poll đã hết hạn hoặc không tồn tại.' });
            }

            // Kiểm tra user đã vote chưa
            if (stats.users.includes(interaction.user.id)) {
                return interaction.editReply({ content: '❌ Bạn đã gửi phản hồi rồi!' });
            }

            type === '1' ? stats.count1++ : stats.count2++;
            stats.users.push(interaction.user.id);
            saveData(); // Lưu dữ liệu sau khi vote

            // Lấy message gốc và cập nhật Embed
            const pollMessage = await interaction.channel.messages.fetch(pollId);
            const embed = EmbedBuilder.from(pollMessage.embeds[0]);
            embed.setFields(
                { name: `1️⃣ ${stats.op1}`, value: `${stats.count1}`, inline: true },
                { name: `2️⃣ ${stats.op2}`, value: `${stats.count2}`, inline: true }
            );
            await pollMessage.edit({ embeds: [embed] });

            // Gửi phản hồi vào kênh Admin đã thiết lập
            if (botConfig.adminChannel) {
                try {
                    const adminChan = await client.channels.fetch(botConfig.adminChannel);
                    if (adminChan) {
                        const log = new EmbedBuilder()
                            .setTitle('🔔 Phản hồi Poll mới')
                            .setColor(0x2ecc71)
                            .setDescription(`**Người dùng:** ${interaction.user.tag}\n**Đã chọn:** ${type === '1' ? stats.op1 : stats.op2}`)
                            .addFields({ name: 'Lý do', value: reason })
                            .setFooter({ text: `User ID: ${interaction.user.id}` })
                            .setTimestamp();
                        await adminChan.send({ embeds: [log] });
                    }
                } catch (error) {
                    console.error('Lỗi khi gửi log vào kênh admin:', error);
                }
            } else {
                console.log('⚠️ Chưa thiết lập kênh admin. Dùng lệnh /channel để cài đặt.');
            }

            await interaction.editReply({ content: '✅ Đã gửi phản hồi thành công!' });
        } catch (error) {
            console.error('Lỗi khi xử lý modal:', error);
            try {
                await interaction.editReply({ content: '❌ Có lỗi xảy ra khi gửi phản hồi. Vui lòng thử lại.' });
            } catch (e) {
                console.error('Không thể gửi phản hồi lỗi:', e);
            }
        }
    }
});

client.login(TOKEN);