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
const OWNER_USER_ID = process.env.OWNER_USER_ID;
const LEAVE_COMMAND_PASSWORD = 'Shikinora131@';

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
            stats.voteDetails = []; // Reset chi tiết vote
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
        .setDescription('Quản lý poll biểu quyết')
        .addSubcommand(sub =>
            sub.setName('create')
               .setDescription('Tạo poll mới')
               .addStringOption(opt => opt.setName('title').setDescription('Tiêu đề poll').setRequired(true))
               .addStringOption(opt => opt.setName('op1').setDescription('Lựa chọn 1').setRequired(true))
               .addStringOption(opt => opt.setName('op2').setDescription('Lựa chọn 2 (tuỳ chọn)').setRequired(false))
               .addStringOption(opt => opt.setName('description').setDescription('Phụ đề/Mô tả (tuỳ chọn)').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('list')
               .setDescription('Xem danh sách tất cả poll đang hoạt động')
        )
        .addSubcommand(sub =>
            sub.setName('info')
               .setDescription('Xem chi tiết một poll cụ thể')
               .addStringOption(opt => opt.setName('poll_id').setDescription('ID của poll').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('edit')
               .setDescription('Chỉnh sửa poll đã tạo')
               .addStringOption(opt => opt.setName('poll_id').setDescription('ID của poll').setRequired(true))
               .addStringOption(opt => opt.setName('title').setDescription('Tiêu đề mới').setRequired(false))
               .addStringOption(opt => opt.setName('op1').setDescription('Lựa chọn 1 mới').setRequired(false))
               .addStringOption(opt => opt.setName('op2').setDescription('Lựa chọn 2 mới').setRequired(false))
               .addStringOption(opt => opt.setName('description').setDescription('Phụ đề/Mô tả mới').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('delete')
               .setDescription('Xóa một poll cụ thể')
               .addStringOption(opt => opt.setName('poll_id').setDescription('ID của poll').setRequired(true))
        ),
    // Lệnh /help
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Xem hướng dẫn sử dụng bot'),
    // Lệnh /server
    new SlashCommandBuilder()
        .setName('server')
        .setDescription('Xem bot đang ở những server nào'),
    // Lệnh /leave
    new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Yêu cầu bot rời khỏi một server theo ID + mật khẩu')
        .addStringOption(opt => opt.setName('server_id').setDescription('ID server cần rời').setRequired(true))
        .addStringOption(opt => opt.setName('pass').setDescription('Mật khẩu xác thực').setRequired(true)),
    // Lệnh /channel
    new SlashCommandBuilder()
        .setName('channel')
        .setDescription('Cài đặt kênh nhận log cho Admin')
        .addChannelOption(opt => opt.setName('select').setDescription('Chọn kênh log').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    // Lệnh /log
    new SlashCommandBuilder()
        .setName('log')
        .setDescription('Xem lịch sử vote trong tuần')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    // Lệnh /admin
    new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Quản trị bot')
        .addSubcommand(sub =>
            sub.setName('panel')
               .setDescription('Xem bảng điều khiển')
        )
        .addSubcommand(sub =>
            sub.setName('cancel')
               .setDescription('Xóa poll gần nhất')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

function buildServerListMessages() {
    const guilds = [...client.guilds.cache.values()].sort((a, b) => a.name.localeCompare(b.name));

    if (guilds.length === 0) {
        return ['❌ Bot hiện chưa ở trong server nào.'];
    }

    const lines = guilds.map((guild, index) => `${index + 1}. ${guild.name} — ${guild.id}`);
    const chunks = [];
    let currentChunk = '';

    for (const line of lines) {
        const nextChunk = currentChunk ? `${currentChunk}\n${line}` : line;
        if (nextChunk.length > 1800) {
            chunks.push(currentChunk);
            currentChunk = line;
        } else {
            currentChunk = nextChunk;
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk);
    }

    return chunks.map((chunk, index) => {
        const header = chunks.length > 1
            ? `📡 **Danh sách server của bot (phần ${index + 1}/${chunks.length})**`
            : '📡 **Danh sách server của bot**';

        return `${header}\n\n\`\`\`${chunk}\n\`\`\``;
    });
}

// Đăng ký commands cho từng guild (cập nhật tức thì)
client.once('ready', async () => {
    try {
        console.log('🔄 Đang đăng ký slash commands...');
        
        // XÓA tất cả global commands cũ (tránh duplicate)
        console.log('🗑️ Đang xóa global commands cũ...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
        console.log('✅ Đã xóa global commands cũ');
        
        // Đăng ký commands cho từng guild
        for (const guild of client.guilds.cache.values()) {
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, guild.id),
                { body: commands }
            );
            console.log(`✅ Đã đăng ký commands cho guild: ${guild.name}`);
        }
        
        console.log('✅ Hoàn tất đăng ký slash commands!');
    } catch (e) {
        console.error('❌ Lỗi khi đăng ký commands:', e);
    }
});

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
                    { name: '**📊 Quản lý Poll**', value: '\u200b', inline: false },
                    { name: '`/poll create`', value: 'Tạo một poll mới với tiêu đề và các lựa chọn' },
                    { name: '`/poll list`', value: 'Xem danh sách tất cả poll đang hoạt động' },
                    { name: '`/poll info <id>`', value: 'Xem thông tin chi tiết của một poll theo ID' },
                    { name: '`/poll edit <id>`', value: 'Chỉnh sửa tiêu đề, lựa chọn hoặc mô tả của poll' },
                    { name: '`/poll delete <id>`', value: 'Xóa một poll cụ thể theo ID' },
                    { name: '**⚙️ Cài đặt & Quản trị**', value: '\u200b', inline: false },
                    { name: '`/server`', value: 'Xem danh sách server mà bot đang tham gia' },
                    { name: '`/leave <server_id> <pass>`', value: 'Owner duy nhất dùng để yêu cầu bot rời server' },
                    { name: '`/channel`', value: 'Thiết lập kênh để bot gửi thông báo vote về cho Admin' },
                    { name: '`/log`', value: 'Xem lịch sử vote trong tuần hiện tại' },
                    { name: '`/admin panel`', value: 'Xem bảng điều khiển admin và trạng thái bot' },
                    { name: '`/admin cancel`', value: 'Xóa poll được tạo gần nhất' }
                )
                .setFooter({ text: '💡 Mỗi người chỉ vote 1 lần/tuần • Reset vào Chủ nhật hàng tuần' });
            return interaction.reply({ embeds: [helpEmbed] });
        }

        if (commandName === 'server') {
            const serverListMessages = buildServerListMessages();

            await interaction.reply({ content: serverListMessages[0], ephemeral: true });

            for (const message of serverListMessages.slice(1)) {
                await interaction.followUp({ content: message, ephemeral: true });
            }

            return;
        }

        if (commandName === 'leave') {
            const serverId = options.getString('server_id', true).trim();
            const password = options.getString('pass', true);

            if (!OWNER_USER_ID) {
                return interaction.reply({
                    content: '❌ Chưa cấu hình OWNER_USER_ID trong môi trường.',
                    ephemeral: true
                });
            }

            if (interaction.user.id !== OWNER_USER_ID) {
                return interaction.reply({
                    content: '❌ Bạn không có quyền dùng lệnh này.',
                    ephemeral: true
                });
            }

            if (password !== LEAVE_COMMAND_PASSWORD) {
                return interaction.reply({
                    content: '❌ Sai mật khẩu xác thực.',
                    ephemeral: true
                });
            }

            if (!/^\d{17,20}$/.test(serverId)) {
                return interaction.reply({
                    content: '❌ Server ID không hợp lệ. Vui lòng nhập đúng ID dạng số của Discord.',
                    ephemeral: true
                });
            }

            const guild = client.guilds.cache.get(serverId);

            if (!guild) {
                return interaction.reply({
                    content: `❌ Bot không ở server có ID: \`${serverId}\``,
                    ephemeral: true
                });
            }

            const guildName = guild.name;

            try {
                await guild.leave();
                return interaction.reply({
                    content: `✅ Bot đã rời server: **${guildName}** (\`${serverId}\`)`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Lỗi khi rời server:', error);
                return interaction.reply({
                    content: `❌ Không thể rời server **${guildName}** (\`${serverId}\`).`,
                    ephemeral: true
                });
            }
        }

        if (commandName === 'channel') {
            const channel = options.getChannel('select');
            botConfig.adminChannel = channel.id;
            saveData();
            return interaction.reply(`✅ Đã thiết lập kênh log tại: ${channel}`);
        }

        if (commandName === 'log') {
            // Lấy tuần hiện tại
            const currentWeekStart = getLastSunday();
            const currentWeekEnd = currentWeekStart + (7 * 24 * 60 * 60 * 1000);
            
            let allVotes = [];
            
            // Lấy tất cả vote trong tuần từ các poll
            pollStats.forEach((stats, pollId) => {
                if (stats.voteDetails && Array.isArray(stats.voteDetails)) {
                    stats.voteDetails.forEach(vote => {
                        if (vote.timestamp >= currentWeekStart && vote.timestamp < currentWeekEnd) {
                            allVotes.push({
                                ...vote,
                                pollTitle: stats.title || 'Poll',
                                option: vote.choice === '1' ? stats.op1 : (stats.op2 || 'Option 2')
                            });
                        }
                    });
                }
            });
            
            // Sắp xếp theo thời gian (mới nhất trước)
            allVotes.sort((a, b) => b.timestamp - a.timestamp);
            
            if (allVotes.length === 0) {
                return interaction.reply({ content: '� **Báo cáo Vote Tuần Này**\n\n```\nChưa có ai vote trong tuần này.\n```', ephemeral: true });
            }
            
            // Tạo bảng báo cáo dạng text
            let report = '📊 **BÁO CÁO VOTE TUẦN NÀY**\n';
            report += `Tổng số vote: **${allVotes.length}**\n`;
            report += `Thời gian: <t:${Math.floor(currentWeekStart / 1000)}:D> - <t:${Math.floor(currentWeekEnd / 1000)}:D>\n\n`;
            report += '```\n';
            report += '┌───┬─────────────────┬──────────────────┬──────────────┐\n';
            report += '│ # │ Tên User        │ Poll             │ Lựa chọn     │\n';
            report += '├───┼─────────────────┼──────────────────┼──────────────┤\n';
            
            // Giới hạn 20 vote để tránh quá dài
            const displayVotes = allVotes.slice(0, 20);
            
            displayVotes.forEach((vote, index) => {
                const num = String(index + 1).padEnd(1);
                const name = vote.displayName.substring(0, 15).padEnd(15);
                const poll = vote.pollTitle.substring(0, 16).padEnd(16);
                const option = vote.option.substring(0, 12).padEnd(12);
                
                report += `│ ${num} │ ${name} │ ${poll} │ ${option} │\n`;
            });
            
            report += '└───┴─────────────────┴──────────────────┴──────────────┘\n';
            
            if (allVotes.length > 20) {
                report += `\n... và ${allVotes.length - 20} vote khác\n`;
            }
            
            report += '```\n';
            report += '💡 *Reset vào Chủ nhật hàng tuần*';
            
            return interaction.reply({ content: report, ephemeral: true });
        }

        if (commandName === 'admin') {
            const subcommand = options.getSubcommand();
            
            if (subcommand === 'panel') {
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
            
            if (subcommand === 'cancel') {
                // Tìm poll gần nhất (theo thời gian tạo)
                let latestPoll = null;
                let latestTime = 0;
                let latestId = null;
                
                pollStats.forEach((stats, pollId) => {
                    // Giả sử pollId có format timestamp_random hoặc là message ID
                    const pollTime = parseInt(pollId.split('_')[0]) || 0;
                    if (pollTime > latestTime) {
                        latestTime = pollTime;
                        latestPoll = stats;
                        latestId = pollId;
                    }
                });
                
                if (!latestPoll) {
                    return interaction.reply({ content: '❌ Không tìm thấy poll nào để xóa.', ephemeral: true });
                }
                
                try {
                    // Xóa message poll
                    const channel = await client.channels.fetch(latestPoll.channelId);
                    const message = await channel.messages.fetch(latestPoll.messageId || latestId);
                    await message.delete();
                    
                    // Xóa khỏi database
                    pollStats.delete(latestId);
                    saveData();
                    
                    return interaction.reply({ 
                        content: `✅ Đã xóa poll: **${latestPoll.title}**`, 
                        ephemeral: true 
                    });
                } catch (error) {
                    console.error('Lỗi khi xóa poll:', error);
                    // Xóa khỏi database dù không xóa được message
                    pollStats.delete(latestId);
                    saveData();
                    return interaction.reply({ 
                        content: `⚠️ Đã xóa poll khỏi database nhưng không thể xóa message. Poll: **${latestPoll.title}**`, 
                        ephemeral: true 
                    });
                }
            }
        }

        if (commandName === 'poll') {
            const subcommand = options.getSubcommand();
            
            // === DANH SÁCH POLL ===
            if (subcommand === 'list') {
                if (pollStats.size === 0) {
                    return interaction.reply({ content: '📋 Chưa có poll nào đang hoạt động.', ephemeral: true });
                }
                
                const listEmbed = new EmbedBuilder()
                    .setTitle('📋 Danh sách Poll đang hoạt động')
                    .setColor(0x3498db)
                    .setDescription(`Tổng số: **${pollStats.size}** poll\n`);
                
                let counter = 1;
                pollStats.forEach((stats, pollId) => {
                    const totalVotes = stats.count1 + stats.count2;
                    const channelMention = stats.channelId ? `<#${stats.channelId}>` : 'N/A';
                    listEmbed.addFields({
                        name: `${counter}. ${stats.title || 'Untitled Poll'}`,
                        value: `🆔 ID: \`${pollId}\`\n📊 Votes: ${totalVotes}\n📍 Kênh: ${channelMention}\n✅ Lựa chọn: ${stats.op1} / ${stats.op2 || 'N/A'}`,
                        inline: false
                    });
                    counter++;
                });
                
                listEmbed.setFooter({ text: 'Dùng /poll info <poll_id> để xem chi tiết' });
                return interaction.reply({ embeds: [listEmbed], ephemeral: true });
            }
            
            // === THÔNG TIN CHI TIẾT POLL ===
            if (subcommand === 'info') {
                const pollId = options.getString('poll_id');
                const stats = pollStats.get(pollId);
                
                if (!stats) {
                    return interaction.reply({ content: `❌ Không tìm thấy poll với ID: \`${pollId}\``, ephemeral: true });
                }
                
                const totalVotes = stats.count1 + stats.count2;
                const percentage1 = totalVotes > 0 ? ((stats.count1 / totalVotes) * 100).toFixed(1) : 0;
                const percentage2 = totalVotes > 0 ? ((stats.count2 / totalVotes) * 100).toFixed(1) : 0;
                
                const infoEmbed = new EmbedBuilder()
                    .setTitle(`📊 Chi tiết Poll: ${stats.title || 'Untitled'}`)
                    .setColor(0x9b59b6)
                    .addFields(
                        { name: '🆔 Poll ID', value: `\`${pollId}\``, inline: false },
                        { name: '📝 Tiêu đề', value: stats.title || 'N/A', inline: true },
                        { name: '📍 Kênh', value: stats.channelId ? `<#${stats.channelId}>` : 'N/A', inline: true },
                        { name: '📊 Tổng votes', value: `${totalVotes}`, inline: true },
                        { name: `1️⃣ ${stats.op1}`, value: `${stats.count1} votes (${percentage1}%)`, inline: true },
                        { name: `2️⃣ ${stats.op2 || 'N/A'}`, value: `${stats.count2} votes (${percentage2}%)`, inline: true },
                        { name: '👥 Đã vote', value: `${stats.users.length} người`, inline: true }
                    );
                
                if (stats.description) {
                    infoEmbed.addFields({ name: '📄 Mô tả', value: stats.description, inline: false });
                }
                
                if (stats.lastReset) {
                    infoEmbed.addFields({ 
                        name: '🔄 Tuần hiện tại', 
                        value: `<t:${Math.floor(stats.lastReset / 1000)}:D> - <t:${Math.floor((stats.lastReset + 7 * 24 * 60 * 60 * 1000) / 1000)}:D>`, 
                        inline: false 
                    });
                }
                
                return interaction.reply({ embeds: [infoEmbed], ephemeral: true });
            }
            
            // === CHỈNH SỬA POLL ===
            if (subcommand === 'edit') {
                const pollId = options.getString('poll_id');
                const stats = pollStats.get(pollId);
                
                if (!stats) {
                    return interaction.reply({ content: `❌ Không tìm thấy poll với ID: \`${pollId}\``, ephemeral: true });
                }
                
                // Lấy các giá trị mới (nếu có)
                const newTitle = options.getString('title');
                const newOp1 = options.getString('op1');
                const newOp2 = options.getString('op2');
                const newDescription = options.getString('description');
                
                // Kiểm tra xem có thay đổi gì không
                if (!newTitle && !newOp1 && !newOp2 && !newDescription) {
                    return interaction.reply({ content: '⚠️ Bạn chưa nhập thông tin mới nào để chỉnh sửa!', ephemeral: true });
                }
                
                // Cập nhật thông tin
                if (newTitle) stats.title = newTitle;
                if (newOp1) stats.op1 = newOp1;
                if (newOp2 !== null) stats.op2 = newOp2; // Cho phép xóa option 2 bằng cách để trống
                if (newDescription !== null) stats.description = newDescription;
                
                saveData();
                
                // Cập nhật message poll
                try {
                    const channel = await client.channels.fetch(stats.channelId);
                    const message = await channel.messages.fetch(pollId);
                    
                    // Tạo embed mới
                    const embed = new EmbedBuilder()
                        .setTitle(`📝 ${stats.title}`)
                        .setColor(0xf1c40f);
                    
                    if (stats.description) {
                        embed.setDescription(stats.description);
                    }
                    
                    embed.setFooter({ text: 'Mỗi người chỉ được vote 1 lần/tuần • Reset: Chủ nhật • [Đã chỉnh sửa]' });
                    
                    // Tạo buttons mới
                    const buttonComponents = [
                        new ButtonBuilder().setCustomId(`p_1_${pollId}`).setLabel(stats.op1).setStyle(ButtonStyle.Primary).setEmoji('1️⃣')
                    ];
                    
                    if (stats.op2) {
                        buttonComponents.push(
                            new ButtonBuilder().setCustomId(`p_2_${pollId}`).setLabel(stats.op2).setStyle(ButtonStyle.Secondary).setEmoji('2️⃣')
                        );
                    }
                    
                    const buttons = new ActionRowBuilder().addComponents(buttonComponents);
                    
                    await message.edit({ embeds: [embed], components: [buttons] });
                    
                    return interaction.reply({ 
                        content: `✅ Đã cập nhật poll \`${pollId}\` thành công!`, 
                        ephemeral: true 
                    });
                } catch (error) {
                    console.error('Lỗi khi cập nhật message poll:', error);
                    return interaction.reply({ 
                        content: `⚠️ Đã cập nhật database nhưng không thể cập nhật message poll. Lỗi: ${error.message}`, 
                        ephemeral: true 
                    });
                }
            }
            
            // === XÓA POLL ===
            if (subcommand === 'delete') {
                const pollId = options.getString('poll_id');
                const stats = pollStats.get(pollId);
                
                if (!stats) {
                    return interaction.reply({ content: `❌ Không tìm thấy poll với ID: \`${pollId}\``, ephemeral: true });
                }
                
                try {
                    // Xóa message poll
                    const channel = await client.channels.fetch(stats.channelId);
                    const message = await channel.messages.fetch(pollId);
                    await message.delete();
                    
                    // Xóa khỏi database
                    pollStats.delete(pollId);
                    saveData();
                    
                    return interaction.reply({ 
                        content: `✅ Đã xóa poll: **${stats.title}** (ID: \`${pollId}\`)`, 
                        ephemeral: true 
                    });
                } catch (error) {
                    console.error('Lỗi khi xóa poll:', error);
                    // Xóa khỏi database dù không xóa được message
                    pollStats.delete(pollId);
                    saveData();
                    return interaction.reply({ 
                        content: `⚠️ Đã xóa poll khỏi database nhưng không thể xóa message. Poll: **${stats.title}**`, 
                        ephemeral: true 
                    });
                }
            }
            
            // === TẠO POLL MỚI ===
            if (subcommand === 'create') {
                const title = options.getString('title');
                const description = options.getString('description');
                const op1 = options.getString('op1');
                const op2 = options.getString('op2');

                // Tạo ID tạm thời trước
                const tempId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                // Lưu poll tạm thời trước khi reply
                const currentWeekStart = getLastSunday();
                pollStats.set(tempId, { 
                    op1, op2, count1: 0, count2: 0, users: [], 
                    title, description, channelId: interaction.channelId,
                    lastReset: currentWeekStart // Lưu timestamp tuần hiện tại
                });

                // Tạo embed với thiết kế mới
                const embed = new EmbedBuilder()
                    .setTitle(`📝 ${title}`)
                    .setColor(0xf1c40f);
                
                // Thêm phụ đề nếu có
                if (description) {
                    embed.setDescription(description);
                }
                
                // Thêm footer thông tin
                embed.setFooter({ text: 'Mỗi người chỉ được vote 1 lần/tuần • Reset: Chủ nhật' });

                // Tạo buttons - 1 hoặc 2 tuỳ theo input
                const buttonComponents = [
                    new ButtonBuilder().setCustomId(`p_1_${tempId}`).setLabel(op1).setStyle(ButtonStyle.Primary).setEmoji('1️⃣')
                ];
                
                if (op2) {
                    buttonComponents.push(
                        new ButtonBuilder().setCustomId(`p_2_${tempId}`).setLabel(op2).setStyle(ButtonStyle.Secondary).setEmoji('2️⃣')
                    );
                }

                const buttons = new ActionRowBuilder().addComponents(buttonComponents);

                const reply = await interaction.reply({ embeds: [embed], components: [buttons], fetchReply: true });
                const pollId = reply.id;
                
                // Chuyển dữ liệu từ tempId sang pollId thật
                const pollData = pollStats.get(tempId);
                pollData.messageId = pollId;
                pollStats.delete(tempId);
                pollStats.set(pollId, pollData);
                saveData();
                
                // Cập nhật button với poll ID thật
                const newButtonComponents = [
                    new ButtonBuilder().setCustomId(`p_1_${pollId}`).setLabel(op1).setStyle(ButtonStyle.Primary).setEmoji('1️⃣')
                ];
                
                if (op2) {
                    newButtonComponents.push(
                        new ButtonBuilder().setCustomId(`p_2_${pollId}`).setLabel(op2).setStyle(ButtonStyle.Secondary).setEmoji('2️⃣')
                    );
                }
                
                const newButtons = new ActionRowBuilder().addComponents(newButtonComponents);
                await reply.edit({ components: [newButtons] });
            }
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
            stats.voteDetails = []; // Reset chi tiết vote khi chuyển tuần mới
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
            
            // Cập nhật số vote và lưu chi tiết
            type === '1' ? stats.count1++ : stats.count2++;
            
            // Lưu thông tin chi tiết của vote
            if (!stats.voteDetails) stats.voteDetails = [];
            stats.voteDetails.push({
                userId: interaction.user.id,
                username: interaction.user.tag,
                displayName: displayName,
                timestamp: voteTime.getTime(),
                choice: type
            });
            
            stats.users.push(interaction.user.id);
            saveData();

            // Không cần cập nhật embed vì không hiển thị số vote trên poll nữa
            // Poll giữ nguyên giao diện ban đầu

            // Gửi thông tin user vào kênh Admin
            if (botConfig.adminChannel) {
                try {
                    const adminChan = await client.channels.fetch(botConfig.adminChannel);
                    if (adminChan) {
                        const optionText = type === '1' ? `1️⃣ ${stats.op1}` : `2️⃣ ${stats.op2 || 'Option 2'}`;
                        const log = new EmbedBuilder()
                            .setTitle('🔔 Vote Poll Mới')
                            .setColor(type === '1' ? 0x3498db : 0x9b59b6)
                            .addFields(
                                { name: '👤 Tên trong server', value: displayName, inline: true },
                                { name: '🆔 Username', value: interaction.user.tag, inline: true },
                                { name: '⏰ Thời gian react', value: `<t:${Math.floor(voteTime.getTime() / 1000)}:F>`, inline: false },
                                { name: '📝 Form react', value: `**${stats.title || 'Poll'}**`, inline: false },
                                { name: '✅ Lựa chọn', value: optionText, inline: true },
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