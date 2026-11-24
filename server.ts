import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      visionReady: Boolean(process.env.GEMINI_API_KEY),
      appUrl: process.env.APP_URL || '',
    });
  });

  app.get('/api/share-status', async (_req, res) => {
    const baseUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
    const publicShareUrl = /^https:\/\/ais-dev-/.test(baseUrl)
      ? baseUrl.replace(/^https:\/\/ais-dev-/, 'https://ais-pre-')
      : baseUrl;

    if (!/^https?:\/\//.test(publicShareUrl)) {
      return res.json({ publicShareUrl, publicReady: false, status: 0 });
    }

    try {
      const response = await fetch(publicShareUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(2500),
      });
      const publicReady = response.status >= 200 && response.status < 400;
      return res.json({
        publicShareUrl,
        publicReady,
        status: response.status,
      });
    } catch {
      return res.json({
        publicShareUrl,
        publicReady: false,
        status: 0,
      });
    }
  });

  app.post('/api/ocr-attendance', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error:
          'Chưa tìm thấy GEMINI_API_KEY trong môi trường máy chủ. Vui lòng thiết lập trong Settings > Secrets hoặc dùng chế độ Điền nhanh từ văn bản.',
      });
    }

    try {
      const body = req.body as {
        imageBase64?: string;
        mimeType?: string;
        hint?: string;
        knownWorkers?: Array<{ fbName: string; krName: string; zone?: string }>;
      };

      if (!body.imageBase64 || typeof body.imageBase64 !== 'string') {
        return res.status(400).json({ error: 'Thiếu dữ liệu hình ảnh.' });
      }

      const rawBase64 = body.imageBase64.includes(',')
        ? body.imageBase64.split(',')[1]
        : body.imageBase64;
      const mimeType = body.mimeType || 'image/jpeg';

      const workerHintList = Array.isArray(body.knownWorkers)
        ? body.knownWorkers
            .slice(0, 100)
            .map(
              (w) =>
                `- ${w.fbName}${w.krName ? ` (${w.krName})` : ''}${w.zone ? ` [${w.zone}]` : ''}`,
            )
            .join('\n')
        : '';

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const currentYear = new Date().getFullYear();

      const prompt = [
        'Bạn là trợ lý trích xuất dữ liệu chấm công & bảng lương từ ảnh (bảng Excel/Google Sheets, sổ tay viết tay, bảng trắng, ảnh chụp màn hình KakaoTalk/Messenger/Zalo).',
        'Hãy đọc toàn bộ thông tin trong ảnh và trả về JSON có cấu trúc chính xác.',
        'Quy tắc trích xuất:',
        `1. "detectedDate": Nếu ảnh có ghi ngày làm việc hoặc ngày chấm công (ví dụ "NGÀY 22/11", "23/11/2026", "11/22"), hãy chuyển sang định dạng "YYYY-MM-DD" (mặc định năm ${currentYear} nếu không ghi năm). Nếu không thấy ngày thì để "".`,
        '2. "detectedZone": Nếu ảnh ghi rõ khu vực/đội là "I동" hoặc "아이동" thì trả về "I동"; nếu ghi "차동" thì trả về "차동"; nếu không rõ thì để "".',
        '3. "items": Danh sách từng nhân sự trong ảnh (KHÔNG đưa dòng "TỔNG CỘNG" hay tiêu đề cột vào items):',
        '   - "name": Tên tiếng Việt hoặc tên Facebook (nếu ảnh chỉ có tên tiếng Hàn thì điền tên tiếng Hàn vào đây).',
        '   - "krName": Tên tiếng Hàn Hangul nếu có trong ảnh (nếu không có thì để "").',
        '   - "hours": Số giờ làm việc dạng số thập phân (ví dụ 5, 8.5, 10). Nếu ảnh KHÔNG ghi số giờ thì trả về -1.',
        '   - "amount": Số tiền đọc được trực tiếp trên dòng đó (ví dụ "60.000" -> 60000, "60k" -> 60000, "120,000원" -> 120000). Nếu ảnh KHÔNG ghi số tiền thì trả về -1.',
        '   - "note": Ghi chú hoặc ca làm việc đi kèm nếu có (nếu không có thì để "").',
        '   - "confidence": Độ tin cậy từ 0 đến 1.',
        body.hint ? `Gợi ý thêm từ người dùng: ${body.hint}` : '',
        workerHintList
          ? `Danh sách nhân sự hiện có để tham khảo chính tả (chỉ dùng để nhận diện chữ mờ, KHÔNG tự bịa thêm người không có trong ảnh):\n${workerHintList}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: rawBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedDate: {
                type: Type.STRING,
                description: 'Ngày phát hiện trong ảnh dạng YYYY-MM-DD hoặc chuỗi rỗng.',
              },
              detectedZone: {
                type: Type.STRING,
                description: 'Khu vực/bảng phát hiện: I동, 차동 hoặc chuỗi rỗng.',
              },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: {
                      type: Type.STRING,
                      description: 'Tên tiếng Việt / Facebook hoặc tên chính của nhân sự.',
                    },
                    krName: {
                      type: Type.STRING,
                      description: 'Tên tiếng Hàn (Hangul) nếu có, hoặc chuỗi rỗng.',
                    },
                    hours: {
                      type: Type.NUMBER,
                      description: 'Số giờ làm việc, hoặc -1 nếu trong ảnh không ghi giờ.',
                    },
                    amount: {
                      type: Type.NUMBER,
                      description: 'Số tiền đọc được (VD 60000), hoặc -1 nếu ảnh không ghi tiền.',
                    },
                    note: {
                      type: Type.STRING,
                      description: 'Ghi chú đi kèm hoặc chuỗi rỗng.',
                    },
                    confidence: {
                      type: Type.NUMBER,
                      description: 'Độ tự tin nhận diện từ 0 tới 1.',
                    },
                  },
                  required: ['name', 'krName', 'hours', 'amount', 'note', 'confidence'],
                },
              },
            },
            required: ['detectedDate', 'detectedZone', 'items'],
          },
        },
      });

      const rawText = (response.text ?? '{"detectedDate":"","detectedZone":"","items":[]}').trim();
      const parsed = JSON.parse(rawText) as {
        detectedDate?: string;
        detectedZone?: string;
        items?: Array<{
          name?: string;
          krName?: string;
          hours?: number;
          amount?: number;
          note?: string;
          confidence?: number;
        }>;
      };

      const detectedDate =
        typeof parsed.detectedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.detectedDate)
          ? parsed.detectedDate
          : '';
      const detectedZone =
        parsed.detectedZone === 'I동' || parsed.detectedZone === '차동'
          ? parsed.detectedZone
          : '';

      const items = Array.isArray(parsed.items)
        ? parsed.items
            .filter((item) => item && typeof item.name === 'string' && item.name.trim().length > 0)
            .map((item) => {
              const rawHours = Number(item.hours);
              const rawAmount = Number(item.amount);
              return {
                name: String(item.name).trim(),
                krName: typeof item.krName === 'string' ? item.krName.trim() : '',
                hours: Number.isFinite(rawHours) && rawHours >= 0 ? rawHours : null,
                amount: Number.isFinite(rawAmount) && rawAmount >= 0 ? Math.round(rawAmount) : null,
                note: typeof item.note === 'string' ? item.note.trim() : '',
                confidence: Number.isFinite(Number(item.confidence))
                  ? Math.min(1, Math.max(0, Number(item.confidence)))
                  : 0.85,
              };
            })
        : [];

      return res.json({ detectedDate, detectedZone, items });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Không thể phân tích hình ảnh chấm công.';
      console.error('OCR attendance error:', err);
      return res.status(500).json({
        error: `Lỗi nhận diện ảnh AI: ${message}`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
