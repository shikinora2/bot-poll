require('dotenv').config();

const { 
    Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, 
    EmbedBuilder, InteractionType, REST, Routes, SlashCommandBuilder,
    PermissionFlagsBits
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Lưu trữ dữ liệu (Trong thực tế nên dùng Database như MongoDB/SQLite)
let botConfig = { adminChannel: null };
const pollStats = new Map();
const systemLogs = []; // Lưu lại các hoạt động gần đây của bot

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
            const pollId = interaction.id;

            pollStats.set(pollId, { op1, op2, count1: 0, count2: 0, users: [] });

            const embed = new EmbedBuilder().setTitle(`📝 ${title}`).setColor(0xf1c40f)
                .addFields({ name: `1️⃣ ${op1}`, value: '0', inline: true }, { name: `2️⃣ ${op2}`, value: '0', inline: true });

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`p_1_${pollId}`).setLabel(op1).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`p_2_${pollId}`).setLabel(op2).setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({ embeds: [embed], components: [buttons] });
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
        const [ , type, pollId] = interaction.customId.split('_');
        const reason = interaction.fields.getTextInputValue('reason');
        const stats = pollStats.get(pollId);
        
        type === '1' ? stats.count1++ : stats.count2++;
        stats.users.push(interaction.user.id);

        // Cập nhật Embed
        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        embed.setFields(
            { name: `1️⃣ ${stats.op1}`, value: `${stats.count1}`, inline: true },
            { name: `2️⃣ ${stats.op2}`, value: `${stats.count2}`, inline: true }
        );
        await interaction.message.edit({ embeds: [embed] });

        // Gửi thông báo về kênh Admin đã cài đặt
        if (botConfig.adminChannel) {
            const adminChan = client.channels.cache.get(botConfig.adminChannel);
            if (adminChan) {
                const log = new EmbedBuilder()
                    .setTitle('🔔 Phản hồi mới')
                    .setDescription(`**${interaction.user.tag}** đã chọn **${type === '1' ? stats.op1 : stats.op2}**`)
                    .addFields({ name: 'Lý do', value: reason })
                    .setTimestamp();
                adminChan.send({ embeds: [log] });
            }
        }

        await interaction.reply({ content: 'Đã gửi phản hồi!', ephemeral: true });
    }
});

client.login(TOKEN);