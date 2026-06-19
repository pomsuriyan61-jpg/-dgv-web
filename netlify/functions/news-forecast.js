// netlify/functions/news-forecast.js
// ค้นข่าวจริงล่าสุดของหุ้น แล้วส่งกลับเป็น JSON ผลกระทบต่อราคา (ไปปรับเส้นพยากรณ์)

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

  const { symbol = '', name = '' } = body;
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

  const system =
`คุณเป็นนักวิเคราะห์การเงิน ใช้เครื่องมือค้นเว็บ (web search) หาข่าวจริงล่าสุด (ภายใน ~30 วัน)
เกี่ยวกับบริษัท ${name} (${symbol}) เช่น การเปิดตัวสินค้า ผลประกอบการ ดีล คดีความ คำสั่งซื้อ การเปลี่ยนผู้บริหาร ฯลฯ
แล้วประเมินผลต่อราคาหุ้นในระยะ 1-3 เดือนข้างหน้า

ตอบกลับเป็น JSON อย่างเดียว ห้ามมีข้อความอื่นนอก JSON และห้ามใส่ \`\`\`:
{"direction":"+|-|0","magnitudePct":<ตัวเลข 0-20>,"durationDays":<ตัวเลข 5-120>,"persistence":"temporary|permanent","confidence":"low|medium|high","headline":"พาดหัวข่าวสำคัญที่สุด","summary":"สรุปผลกระทบเป็นภาษาไทยสั้น ๆ 1-2 ประโยค"}

หลักการประเมิน:
- direction "+" ถ้าข่าวบวก, "-" ถ้าลบ, "0" ถ้าไม่มีข่าวสำคัญ/ผลไม่ชัด
- magnitudePct = คาดว่ากระทบราคากี่ % (ข่าวใหญ่จริง ๆ เท่านั้นถึงเกิน 10%)
- durationDays = ผลอยู่นานกี่วัน, persistence "temporary" ถ้าเป็นกระแสชั่วคราว / "permanent" ถ้าเปลี่ยนพื้นฐานบริษัท
- ถ้าไม่เจอข่าวสำคัญจริง ๆ ให้ direction "0" magnitudePct 0`;

  const messages = [{ role: 'user', content: `ค้นข่าวล่าสุดของ ${name} (${symbol}) แล้วประเมินผลกระทบต่อราคา ตอบเป็น JSON ตามรูปแบบที่กำหนด` }];

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        system,
        messages,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      }),
    });
    const data = await r.json();
    if (data.error) return { statusCode: 200, headers: cors, body: JSON.stringify({ error: data.error.message || 'API error' }) };
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    let impact = null;
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { impact = JSON.parse(m[0]); } catch (e) {} }
    return { statusCode: 200, headers: cors, body: JSON.stringify({ impact, raw: text }) };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ error: String(e) }) };
  }
};
