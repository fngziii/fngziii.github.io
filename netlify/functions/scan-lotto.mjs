import { GoogleGenAI } from "@google/genai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: CORS_HEADERS }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.imageBase64) {
      return Response.json(
        { error: "Missing imageBase64 in request body" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const mimeType = body.mimeType || "image/jpeg";
    const base64Data = String(body.imageBase64).replace(/^data:[^;]+;base64,/, "");

    const genAI = new GoogleGenAI({});
    const prompt = `คุณคือระบบ AI อ่านเลขสลากกินแบ่งรัฐบาลไทยที่มีความแม่นยำสูง
กรุณาอ่านหมายเลขสลากกินแบ่ง 6 หลักทั้งหมดที่ปรากฏในรูปภาพนี้ตามลำดับจากใบบนสุดลงมาหาใบล่างสุด (รูปนี้อาจเป็นปึกสลากประมาณ 10 ใบซ้อนเหลื่อมกัน หรือเป็นแผงหวย)
- สลากแต่ละใบจะมีตัวเลขอารบิก 6 หลักคมชัดอยู่ตรงกลางค่อนไปทางขวา
- ใต้ตัวเลขแต่ละหลักอาจมีคำอ่านภาษาอังกฤษ 3 ตัว (เช่น ZER=0, ONE=1, TUO=2, THR=3, FOR=4, FIV=5, SIX=6, SEU/SEV=7, EGT=8, NIN=9) ให้ใช้ช่วยตรวจความถูกต้องของตัวเลข
- อ่านวันที่งวดสลาก (เช่น 1 ธันวาคม 2569 / 1 DECEMBER 2026) ให้แปลงเป็นรูปแบบย่อ เช่น "งวด 1 ธ.ค. 69" (โดยปีปัจจุบันคือ พ.ศ. 2569 / 2026 แม้ว่าจะมีตรายางหรือตัวเลขอื่นประทับทับ ให้ยึดปี 2569 เป็นหลัก)

ตอบกลับเป็น JSON เท่านั้น (ห้ามใส่คำบรรยายอื่น):
{"periodName": "งวด ...", "numbers": ["389396", "840969"]}`;

    const modelsToTry = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash"];
    let rawText = "";
    let lastErr = null;

    for (const modelName of modelsToTry) {
      try {
        const result = await genAI.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Data
                  }
                },
                { text: prompt }
              ]
            }
          ]
        });
        rawText = result.text || "";
        if (rawText) break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!rawText) {
      throw lastErr || new Error("No response from AI model");
    }

    let numbers = [];
    let periodName = "";

    const cleaned = rawText.replace(/```json|```/gi, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && Array.isArray(parsed.numbers)) {
        numbers = parsed.numbers
          .map((n) => String(n).replace(/\D/g, ""))
          .filter((n) => n.length === 6);
      }
      if (parsed && typeof parsed.periodName === "string") {
        periodName = parsed.periodName.trim();
      }
    } catch {
      const matches = cleaned.match(/\b\d{6}\b/g);
      if (matches) numbers = matches;
    }

    return Response.json(
      {
        numbers,
        periodName,
        count: numbers.length
      },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    return Response.json(
      { error: String(error?.message || error) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

export const config = {
  path: "/api/scan-lotto"
};
