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
        .setDescription('Tạo poll biểu quyết')
        .addSubcommand(sub =>
            sub.setName('create')
               .setDescription('Tạo poll mới')
               .addStringOption(opt => opt.setName('title').setDescription('Tiêu đề poll').setRequired(true))
               .addStringOption(opt => opt.setName('op1').setDescription('Lựa chọn 1').setRequired(true))
               .addStringOption(opt => opt.setName('op2').setDescription('Lựa chọn 2 (tuỳ chọn)').setRequired(false))
               .addStringOption(opt => opt.setName('description').setDescription('Phụ đề/Mô tả (tuỳ chọn)').setRequired(false))
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
            report += '┌────┬─────────────────────┬──────────────────────┬─────────────────┐\n';
            report += '│ #  │ Tên User            │ Poll                 │ Lựa chọn        │\n';
            report += '├────┼─────────────────────┼──────────────────────┼─────────────────┤\n';
            
            // Giới hạn 20 vote để tránh quá dài
            const displayVotes = allVotes.slice(0, 20);
            
            displayVotes.forEach((vote, index) => {
                const num = String(index + 1).padEnd(2);
                const name = vote.displayName.substring(0, 19).padEnd(19);
                const poll = vote.pollTitle.substring(0, 20).padEnd(20);
                const option = vote.option.substring(0, 15).padEnd(15);
                
                report += `│ ${num} │ ${name} │ ${poll} │ ${option} │\n`;
            });
            
            report += '└────┴─────────────────────┴──────────────────────┴─────────────────┘\n';
            
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