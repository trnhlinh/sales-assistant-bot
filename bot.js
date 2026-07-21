require('dotenv').config();
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 1. Khởi tạo cấu hình
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ALLOWED_USERS = (process.env.ALLOWED_USERS || '').split(',').map(id => id.trim());

if (!TELEGRAM_TOKEN || !GEMINI_API_KEY) {
  console.error("Lỗi: Thiếu TELEGRAM_BOT_TOKEN hoặc GEMINI_API_KEY trong file .env");
  process.exit(1);
}

// 2. Khởi tạo Telegram Bot và Gemini AI
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Xử lý lỗi polling để tránh bot bị crash khi mất mạng cục bộ
bot.on("polling_error", (err) => console.log("Polling error:", err));

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const userStates = {}; // Quản lý trạng thái State Machine của từng user

// 3. Đọc dữ liệu Knowledge Base
let systemInstruction = "";
try {
  systemInstruction = fs.readFileSync(path.join(__dirname, 'knowledge_base.md'), 'utf8');
  console.log("✅ Đã nạp thành công Knowledge Base!");
} catch (error) {
  console.error("❌ Không thể đọc file knowledge_base.md:", error.message);
  process.exit(1);
}

// Hàm gọi Gemini AI
async function getGeminiResponse(userMessage) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemInstruction,
    });
    const result = await model.generateContent(userMessage);
    return result.response.text();
  } catch (error) {
    console.error("Lỗi từ Gemini API:", error);
    return "Xin lỗi, hiện tại tôi đang gặp sự cố khi suy nghĩ. Bạn thử lại sau nhé!";
  }
}

function getMainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📝 Viết bài Truyền thông", callback_data: "CAT_POST" }],
        [{ text: "📞 Kịch bản Telesale", callback_data: "CAT_TELESALE" }],
        [{ text: "💬 Kịch bản Chatsale", callback_data: "CAT_CHATSALE" }],
        [{ text: "🛡️ Xử lý từ chối", callback_data: "CAT_OBJECTION" }]
      ]
    }
  };
}

function getCancelButton() {
  return [{ text: "🔙 Hủy bỏ / Chọn lại từ đầu", callback_data: "CANCEL" }];
}

// ------------------------------------------------------------------------
// XỬ LÝ LỆNH /START HOẶC TIN NHẮN TEXT BÌNH THƯỜNG
// ------------------------------------------------------------------------
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text;

  if (msg.chat.type !== 'private') return;

  if (ALLOWED_USERS.length > 0 && ALLOWED_USERS[0] !== '' && !ALLOWED_USERS.includes(userId)) {
    bot.sendMessage(chatId, `🔒 Xin lỗi, bạn không có quyền truy cập Bot này. (User ID: ${userId})`);
    return;
  }

  if (!userStates[chatId]) {
    userStates[chatId] = { step: 'IDLE' };
  }

  if (text === '/start') {
    userStates[chatId] = { step: 'IDLE' }; 
    const welcomeMsg = `Xin chào ${msg.from.first_name}! 👋\n\nTôi là Trợ lý AI Sale & Marketing của team Pro Trader Bootcamp.\nHãy bấm vào một trong các Nhóm Công Việc dưới đây để tôi hỗ trợ bạn tốt nhất:`;
    bot.sendMessage(chatId, welcomeMsg, getMainMenu());
    return;
  }

  const state = userStates[chatId];
  if (state.step && state.step.startsWith('WAITING_FOR_TEXT_')) {
    const stepName = state.step.replace('WAITING_FOR_TEXT_', '');
    state[stepName] = text;

    if (state.category === 'POST') {
      if (stepName === 'audience') askPostPurpose(chatId);
      else if (stepName === 'purpose') askPostTone(chatId);
      else if (stepName === 'tone') askPostCTA(chatId);
      else if (stepName === 'cta') executeSuperPrompt(chatId);
    } 
    else if (state.category === 'TELESALE') {
      if (stepName === 'audience') askTelePurpose(chatId);
      else if (stepName === 'purpose') askTelesaleData(chatId);
      else if (stepName === 'data') executeSuperPrompt(chatId);
    }
    else if (state.category === 'CHATSALE') {
      if (stepName === 'audience') askChatPurpose(chatId);
      else if (stepName === 'purpose') askChatsaleData(chatId);
      else if (stepName === 'data') executeSuperPrompt(chatId);
    }
    else if (state.category === 'OBJECTION') {
      if (stepName === 'audience') askObjReason(chatId);
      else if (stepName === 'reason') executeSuperPrompt(chatId);
    }
    return; 
  }

  if (state.step === 'IDLE' || state.step.startsWith('ASK_')) {
    if (state.step.startsWith('ASK_')) {
      const stepName = state.step.replace('ASK_', '').toLowerCase();
      state[stepName] = text; 
      
      if (state.category === 'POST') {
        if (stepName === 'audience') askPostPurpose(chatId);
        else if (stepName === 'purpose') askPostTone(chatId);
        else if (stepName === 'tone') askPostCTA(chatId);
        else if (stepName === 'cta') executeSuperPrompt(chatId);
      } 
      else if (state.category === 'TELESALE') {
        if (stepName === 'audience') askTelePurpose(chatId);
        else if (stepName === 'purpose') askTelesaleData(chatId);
      }
      else if (state.category === 'CHATSALE') {
        if (stepName === 'audience') askChatPurpose(chatId);
        else if (stepName === 'purpose') askChatsaleData(chatId);
      }
      else if (state.category === 'OBJECTION') {
        if (stepName === 'audience') askObjReason(chatId);
        else if (stepName === 'reason') executeSuperPrompt(chatId);
      }
    } else {
      bot.sendMessage(chatId, "💡 Vui lòng bấm một nút để chọn luồng công việc nhé!", getMainMenu());
    }
  }
});

// ------------------------------------------------------------------------
// XỬ LÝ SỰ KIỆN CLICK NÚT BẤM (CALLBACK QUERY)
// ------------------------------------------------------------------------
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (!userStates[chatId]) userStates[chatId] = { step: 'IDLE' };
  const state = userStates[chatId];

  if (data === "CANCEL") {
    userStates[chatId] = { step: 'IDLE' };
    bot.sendMessage(chatId, "🔄 Đã hủy bỏ thao tác. Chọn lại công việc nhé:", getMainMenu());
    bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('OTHER_')) {
    const fieldName = data.replace('OTHER_', '');
    state.step = `WAITING_FOR_TEXT_${fieldName}`;
    bot.sendMessage(chatId, "✍️ Vui lòng gõ ý tưởng/mô tả của riêng bạn vào đây:");
    bot.answerCallbackQuery(query.id);
    return;
  }

  // 1. NHÁNH ROOT
  if (data === "CAT_POST" || data === "CAT_TELESALE" || data === "CAT_CHATSALE" || data === "CAT_OBJECTION") {
    state.category = data.replace('CAT_', '');
    askAudience(chatId);
  }

  // 2. NHÁNH AUDIENCE CHUNG
  else if (data.startsWith("AUDIENCE_")) {
    const textMapping = {
      'AUDIENCE_ELEPHANT': 'Tệp Săn Voi (Kiên nhẫn chờ thương vụ lớn, bắt trend dài)',
      'AUDIENCE_RABBIT': 'Tệp Săn Thỏ (Vốn ít, thích lướt sóng)',
      'AUDIENCE_OFFICE': 'Dân văn phòng bận rộn / Ít canh bảng',
      'AUDIENCE_F0': 'F0 / Sinh viên mới tìm hiểu'
    };
    state.audience = textMapping[data];
    routeAfterAudience(chatId);
  }

  // 3. NHÁNH PURPOSE POST
  else if (data.startsWith("POST_PURPOSE_")) {
    const textMapping = {
      'POST_PURPOSE_AWARENESS': 'Giới thiệu giải đấu (Awareness)',
      'POST_PURPOSE_EDU': 'Giáo dục phương pháp trade (Edu)',
      'POST_PURPOSE_CHOT': 'Chốt nạp 30tr (Conversion)',
      'POST_PURPOSE_GOMLEAD': 'Tặng mồi nhử gom Lead'
    };
    state.purpose = textMapping[data];
    askPostTone(chatId);
  }
  else if (data.startsWith("POST_TONE_")) {
    const textMapping = {
      'POST_TONE_FOMO': 'Gấp gáp, Thách thức (Đánh mạnh tâm lý FOMO)',
      'POST_TONE_EXPERT': 'Chuyên gia, Điềm đạm, Phân tích số liệu',
      'POST_TONE_FUNNY': 'Hài hước, "Cà khịa" nhẹ nhàng',
      'POST_TONE_STORY': 'Thấu cảm, Kể chuyện (Storytelling)'
    };
    state.tone = textMapping[data];
    askPostCTA(chatId);
  }
  else if (data.startsWith("POST_CTA_")) {
    const textMapping = {
      'POST_CTA_ZALO': 'Vào Group Zalo',
      'POST_CTA_WEB': 'Click link Đăng ký Web',
      'POST_CTA_INBOX': 'Nhắn tin trực tiếp cho Admin'
    };
    state.cta = textMapping[data];
    executeSuperPrompt(chatId);
  }

  // 4. NHÁNH PURPOSE TELESALE
  else if (data.startsWith("TELE_PURPOSE_")) {
    const textMapping = {
      'TELE_PURPOSE_COLD': 'Gọi chào giới thiệu giải đấu (Khách lạnh)',
      'TELE_PURPOSE_EDU': 'Gọi trao đổi phương pháp trade',
      'TELE_PURPOSE_WARM': 'Gọi chốt nạp 30tr (Khách ấm/nóng)',
      'TELE_PURPOSE_HOT': 'Gọi cảnh báo rủi ro kẹp hàng'
    };
    state.purpose = textMapping[data];
    askTelesaleData(chatId);
  }

  // 5. NHÁNH PURPOSE CHATSALE
  else if (data.startsWith("CHAT_PURPOSE_")) {
    const textMapping = {
      'CHAT_PURPOSE_START': 'Bắt chuyện làm quen & Khơi gợi',
      'CHAT_PURPOSE_GIFT': 'Nhắn tin tặng tài liệu (Mồi nhử)',
      'CHAT_PURPOSE_FOMO': 'Gửi Performance/BXH tạo FOMO',
      'CHAT_PURPOSE_PAIN': 'Phân tích mã khách đang kẹp'
    };
    state.purpose = textMapping[data];
    askChatsaleData(chatId);
  }

  // 6. NHÁNH OBJECTION
  else if (data.startsWith("OBJ_REASON_")) {
    const textMapping = {
      'OBJ_REASON_MONEY': 'Chê phải nạp 30tr to quá',
      'OBJ_REASON_RULE': 'Sợ luật cắt lỗ 8% gắt quá',
      'OBJ_REASON_TIME': 'Kêu bận, không có thời gian trade',
      'OBJ_REASON_COMPLEX': 'Giải đấu lằng nhằng khó hiểu'
    };
    state.reason = textMapping[data];
    executeSuperPrompt(chatId);
  }

  bot.answerCallbackQuery(query.id); 
});


// ------------------------------------------------------------------------
// CÁC HÀM TRỢ GIÚP GỌI NÚT BẤM
// ------------------------------------------------------------------------

function askAudience(chatId) {
  userStates[chatId].step = 'ASK_AUDIENCE';
  bot.sendMessage(chatId, "👤 CHÂN DUNG KHÁCH HÀNG mục tiêu là ai?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🐘 Săn Voi (Kiên nhẫn chờ thương vụ lớn, bắt trend dài)", callback_data: "AUDIENCE_ELEPHANT" }],
        [{ text: "🐇 Săn Thỏ (Vốn ít, lướt sóng)", callback_data: "AUDIENCE_RABBIT" }],
        [{ text: "🏢 Dân văn phòng bận rộn / Ít canh bảng", callback_data: "AUDIENCE_OFFICE" }],
        [{ text: "🎓 F0 / Sinh viên mới tìm hiểu", callback_data: "AUDIENCE_F0" }],
        [{ text: "✏️ Khác (Chân dung khác)", callback_data: "OTHER_audience" }],
        getCancelButton()
      ]
    }
  });
}

function routeAfterAudience(chatId) {
  const state = userStates[chatId];
  if (state.category === 'POST') askPostPurpose(chatId);
  else if (state.category === 'TELESALE') askTelePurpose(chatId);
  else if (state.category === 'CHATSALE') askChatPurpose(chatId);
  else if (state.category === 'OBJECTION') askObjReason(chatId);
}

function askPostPurpose(chatId) {
  userStates[chatId].step = 'ASK_PURPOSE';
  bot.sendMessage(chatId, "🎯 MỤC ĐÍCH của bài viết truyền thông này là gì?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📢 Giới thiệu giải đấu (Awareness)", callback_data: "POST_PURPOSE_AWARENESS" }],
        [{ text: "📖 Giáo dục phương pháp trade (Edu)", callback_data: "POST_PURPOSE_EDU" }],
        [{ text: "🎯 Chốt nạp 30tr (Conversion)", callback_data: "POST_PURPOSE_CHOT" }],
        [{ text: "🎁 Tặng mồi nhử gom Lead", callback_data: "POST_PURPOSE_GOMLEAD" }],
        [{ text: "✏️ Khác", callback_data: "OTHER_purpose" }],
        getCancelButton()
      ]
    }
  });
}

function askTelePurpose(chatId) {
  userStates[chatId].step = 'ASK_PURPOSE';
  bot.sendMessage(chatId, "📞 MỤC ĐÍCH của cuộc gọi Telesale là gì?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📢 Gọi chào giới thiệu giải đấu (Khách lạnh)", callback_data: "TELE_PURPOSE_COLD" }],
        [{ text: "📈 Gọi trao đổi phương pháp trade", callback_data: "TELE_PURPOSE_EDU" }],
        [{ text: "🎯 Gọi chốt nạp 30tr (Khách ấm/nóng)", callback_data: "TELE_PURPOSE_WARM" }],
        [{ text: "🆘 Gọi cảnh báo rủi ro kẹp hàng", callback_data: "TELE_PURPOSE_HOT" }],
        [{ text: "✏️ Khác", callback_data: "OTHER_purpose" }],
        getCancelButton()
      ]
    }
  });
}

function askChatPurpose(chatId) {
  userStates[chatId].step = 'ASK_PURPOSE';
  bot.sendMessage(chatId, "💬 MỤC ĐÍCH của cuộc trò chuyện hiện tại?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "👋 Bắt chuyện làm quen & Khơi gợi", callback_data: "CHAT_PURPOSE_START" }],
        [{ text: "🎁 Nhắn tin tặng tài liệu (Mồi nhử)", callback_data: "CHAT_PURPOSE_GIFT" }],
        [{ text: "🚀 Gửi Performance/BXH tạo FOMO", callback_data: "CHAT_PURPOSE_FOMO" }],
        [{ text: "🕵️ Phân tích mã khách đang kẹp", callback_data: "CHAT_PURPOSE_PAIN" }],
        [{ text: "✏️ Khác", callback_data: "OTHER_purpose" }],
        getCancelButton()
      ]
    }
  });
}

function askObjReason(chatId) {
  userStates[chatId].step = 'ASK_REASON';
  bot.sendMessage(chatId, "🛡️ LÝ DO khách đang chê/sợ là gì?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💸 Chê phải nạp 30tr to quá", callback_data: "OBJ_REASON_MONEY" }],
        [{ text: "😨 Sợ luật cắt lỗ 8% gắt quá", callback_data: "OBJ_REASON_RULE" }],
        [{ text: "⏳ Kêu bận, không có thời gian trade", callback_data: "OBJ_REASON_TIME" }],
        [{ text: "😒 Giải đấu lằng nhằng khó hiểu", callback_data: "OBJ_REASON_COMPLEX" }],
        [{ text: "✏️ Khác (Khách chê thứ khác)", callback_data: "OTHER_reason" }],
        getCancelButton()
      ]
    }
  });
}

function askPostTone(chatId) {
  userStates[chatId].step = 'ASK_TONE';
  bot.sendMessage(chatId, "🎭 TONE GIỌNG (Giọng văn) bài viết thế nào?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔥 Thách thức, FOMO gấp gáp", callback_data: "POST_TONE_FOMO" }],
        [{ text: "🛡️ Chuyên gia, Điềm đạm, Phân tích", callback_data: "POST_TONE_EXPERT" }],
        [{ text: "😄 Hài hước, Cà khịa nhẹ nhàng", callback_data: "POST_TONE_FUNNY" }],
        [{ text: "📖 Thấu cảm, Kể chuyện", callback_data: "POST_TONE_STORY" }],
        [{ text: "✏️ Khác (Tone giọng khác)", callback_data: "OTHER_tone" }],
        getCancelButton()
      ]
    }
  });
}

function askPostCTA(chatId) {
  userStates[chatId].step = 'ASK_CTA';
  bot.sendMessage(chatId, "🔗 KÊU GỌI HÀNH ĐỘNG (CTA) cuối bài là gì?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Vào Group Zalo", callback_data: "POST_CTA_ZALO" }],
        [{ text: "Click link Đăng ký Web", callback_data: "POST_CTA_WEB" }],
        [{ text: "Nhắn tin trực tiếp cho Admin", callback_data: "POST_CTA_INBOX" }],
        [{ text: "✏️ Khác (CTA khác)", callback_data: "OTHER_cta" }],
        getCancelButton()
      ]
    }
  });
}

function askTelesaleData(chatId) {
  userStates[chatId].step = 'WAITING_FOR_TEXT_data';
  bot.sendMessage(chatId, "📝 Hãy GÕ VÀO ĐÂY dữ liệu về khách (VD: Khách tên Hải, làm IT, đang kẹp lỗ DIG):", {
    reply_markup: { inline_keyboard: [getCancelButton()] }
  });
}

function askChatsaleData(chatId) {
  userStates[chatId].step = 'WAITING_FOR_TEXT_data';
  bot.sendMessage(chatId, "💬 Hãy COPY & PASTE tin nhắn gần nhất của khách vào đây để tôi phân tích:", {
    reply_markup: { inline_keyboard: [getCancelButton()] }
  });
}


// ------------------------------------------------------------------------
// THỰC THI SUPER PROMPT
// ------------------------------------------------------------------------
async function executeSuperPrompt(chatId) {
  const state = userStates[chatId];
  let prompt = "";

  bot.sendMessage(chatId, "⏳ Đang vận dụng toàn bộ kỹ năng Marketing để xuất chiêu... (Đợi 3-5s)");
  bot.sendChatAction(chatId, 'typing');

  if (state.category === 'POST') {
    prompt = `Bạn là chuyên gia Copywriting xuất chúng. Hãy viết một bài Truyền thông cho giải đấu Pro Trader Bootcamp:
- Tệp khách hàng: ${state.audience}
- Mục đích bài viết: ${state.purpose}
- Giọng văn (Tone): ${state.tone}
- Kêu gọi hành động (CTA): ${state.cta}

Yêu cầu bắt buộc:
1. Áp dụng ít nhất 1 Framework Copywriting (PAS, AIDA, 4U...) hoặc Tâm lý học (FOMO, Loss Aversion...) phù hợp một cách tự nhiên.
2. Trình bày bài viết rõ ràng, xuống dòng thoáng, có icon.
3. KHÔNG ĐƯỢC giải thích chiến thuật. CHỈ TRẢ LỜI văn bản trơn kèm emoji, KHÔNG DÙNG markdown (như ***, ###).`;
  } 
  else if (state.category === 'TELESALE') {
    prompt = `Bạn là chuyên gia Telesale (Sói già phố Wall). Hãy lên một kịch bản gọi điện thoại chi tiết:
- Tệp khách hàng: ${state.audience}
- Mục đích cuộc gọi: ${state.purpose}
- Dữ liệu khách: ${state.data}

Yêu cầu bắt buộc:
1. Dùng SPIN Selling (hoặc BANT nếu chốt nóng) để điều hướng khách.
2. Viết chi tiết lời thoại của Sale (Mình) và phản ứng của Khách.
3. KHÔNG ĐƯỢC giải thích chiến thuật. CHỈ TRẢ LỜI văn bản trơn kèm emoji, KHÔNG DÙNG markdown (như ***, ###).`;
  }
  else if (state.category === 'CHATSALE') {
    prompt = `Bạn là chuyên gia Chat Chốt Khách. Khách nhắn tin và bạn cần trả lời:
- Tệp khách hàng: ${state.audience}
- Mục đích: ${state.purpose}
- Tin nhắn của khách / Bối cảnh: ${state.data}

Yêu cầu:
1. Cung cấp 2 đến 3 CÁCH TRẢ LỜI khác nhau (VD: Cách 1 xoáy nỗi đau, Cách 2 dỗ ngọt tặng quà).
2. Viết sẵn đoạn text để tôi có thể copy gửi ngay.
3. KHÔNG ĐƯỢC giải thích chiến thuật. CHỈ TRẢ LỜI văn bản trơn kèm emoji, KHÔNG DÙNG markdown (như ***, ###).`;
  }
  else if (state.category === 'OBJECTION') {
    prompt = `Bạn là chuyên gia Xử lý từ chối. Khách hàng gặp rào cản:
- Tệp khách hàng: ${state.audience}
- Lý do từ chối: ${state.reason}

Yêu cầu:
1. Dùng công thức 3F (Feel-Felt-Found) hoặc các đòn bẩy tâm lý để bẻ gãy từ chối.
2. Viết câu trả lời nguyên văn để tôi gửi khách.
3. Kết hợp khéo léo thể lệ giải đấu (Luật 8% hoặc vốn x10) vào câu trả lời.
4. KHÔNG ĐƯỢC giải thích chiến thuật. CHỈ TRẢ LỜI văn bản trơn kèm emoji, KHÔNG DÙNG markdown (như ***, ###).`;
  }

  const reply = await getGeminiResponse(prompt);
  
  if (reply.length > 4000) {
    const parts = reply.match(/[\s\S]{1,4000}/g) || [];
    for (const part of parts) {
      try { await bot.sendMessage(chatId, part, { parse_mode: 'Markdown' }); } 
      catch(e) { await bot.sendMessage(chatId, part); }
    }
  } else {
    try { await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' }); } 
    catch(e) { await bot.sendMessage(chatId, reply); }
  }

  userStates[chatId] = { step: 'IDLE' };
  bot.sendMessage(chatId, "✅ Đã xong! Bạn muốn làm gì tiếp theo?", getMainMenu());
}

console.log("🚀 Guided Sales Assistant Bot đang chạy...");

// ------------------------------------------------------------------------
// DUMMY SERVER CHO RENDER (Để vượt qua Port Binding Check)
// ------------------------------------------------------------------------
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌍 Dummy server đang chạy trên port ${PORT}`);
});
