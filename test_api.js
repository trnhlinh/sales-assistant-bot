require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function test() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent("Hello");
    console.log("✅ gemini-2.5-flash works:", result.response.text());
  } catch (e) {
    console.error("❌ gemini-2.5-flash error:", e.message);
  }
}
test();
