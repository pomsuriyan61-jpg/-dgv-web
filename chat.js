// netlify/functions/chat.js
// AI แชทแบบ DGV — เก็บ API key ไว้หลังบ้าน (ปลอดภัย) + ค้นข่าวจริงด้วย web search
// ตั้งค่า ANTHROPIC_API_KEY ใน Netlify (Site configuration > Environment variables)

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY ใน Netlify' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'bad json' }) }; }

  const { messages = [], symbol = '', stats = {} } = body;
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

  const system =
`คุณคือ DGV — ผู้ช่วย AI ที่คุยเป็นธรรมชาติเหมือนเพื่อนที่เก่งเรื่องการเงิน ไม่ใช่หุ่นยนต์อ่านรายงาน
ตอบเป็นภาษาไทยลื่นไหล ปรับความยาวตามคำถาม (ถามสั้นตอบสั้น) ไม่ต้องใส่หัวข้อทุกครั้ง
คุณตอบได้ทุกเรื่องเหมือน ChatGPT/Gemini แต่เด่นสุดเรื่องหุ้น/การลงทุน

ข้อมูลปัจจุบันที่ผู้ใช้กำลังดู: ${symbol}
- ราคา $${stats.price} เปลี่ยนแปลงวันนี้ ${stats.chg}%
- ความผันผวนรายวัน ~${stats.volPct}% · RSI ${stats.rsi} · แนวโน้ม ${stats.trend}

เมื่อผู้ใช้ถามเกี่ยวกับข่าว เหตุการณ์ล่าสุด การเปิดตัวสินค้า ผลประกอบการ หรือแนวโน้มปัจจุบัน
ให้ใช้เครื่องมือค้นเว็บ (web search) หาข่าวจริงก่อนตอบเสมอ และอ้างอิงสิ่งที่เจอ

เมื่อวิเคราะห์ผลกระทบของข่าวต่อราคา ให้ต่อท้ายคำตอบด้วยบล็อกนี้เป๊ะ ๆ (ผู้ใช้กดปุ่มใส่ลงกราฟพยากรณ์ได้):
\`\`\`dgv-impact
{"direction":"+","magnitudePct":8,"durationDays":30,"persistence":"temporary","confidence":"medium"}
\`\`\`
(direction = "+" หรือ "-", persistence = "temporary" หรือ "permanent")
เตือนเสมอว่าเป็นการประเมินจากแบบจำลอง ไม่ใช่คำแนะนำการลงทุน ผลย้อนหลังไม่การันตีอนาคต`;

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 1300,
        temperature: 0.7,
        system,
        messages,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      }),
    });
    const data = await r.json();
    if (data.error) return { statusCode: 200, headers: cors, body: JSON.stringify({ error: data.error.message || 'API error' }) };
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    return { statusCode: 200, headers: cors, body: JSON.stringify({ text: text || '(ไม่มีคำตอบ)' }) };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ error: String(e) }) };
  }
};
