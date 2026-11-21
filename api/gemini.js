module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({
      server: '정상 작동 중',
      apiKeyConnected: Boolean(apiKey),
      message: apiKey
        ? '완벽합니다! 자동 우회 모드로 누구나 AI를 쓸 수 있어요.'
        : 'Vercel에 GEMINI_API_KEY를 먼저 등록해 주세요.'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }

  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel에 GEMINI_API_KEY가 등록되지 않았습니다.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // 503 과부하 시 자동으로 다음 무료 모델로 우회
    const rawModels = [
      process.env.GEMINI_MODEL,
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite'
    ].filter(Boolean);
    const models = [...new Set(rawModels)];

    let payload;
    if (body.contents) {
      payload = {
        contents: body.contents,
        ...(body.systemInstruction ? { systemInstruction: body.systemInstruction } : {}),
        ...(body.generationConfig ? { generationConfig: body.generationConfig } : {})
      };
    } else {
      const parts = [];
      if (body.prompt) parts.push({ text: body.prompt });
      if (body.imageBase64) {
        const cleanBase64 = body.imageBase64.replace(/^data:image\/[^;]+;base64,/, '');
        parts.push({
          inlineData: {
            mimeType: body.mimeType || 'image/jpeg',
            data: cleanBase64
          }
        });
      }
      payload = {
        contents: [{ role: 'user', parts }],
        ...(body.systemInstruction
          ? { systemInstruction: { parts: [{ text: body.systemInstruction }] } }
          : {}),
        ...(body.generationConfig ? { generationConfig: body.generationConfig } : {})
      };
    }

    let lastStatus = 500;
    let lastData = null;

    for (const model of models) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        const text =
          (data &&
            data.candidates &&
            data.candidates[0] &&
            data.candidates[0].content &&
            data.candidates[0].content.parts &&
            data.candidates[0].content.parts[0] &&
            data.candidates[0].content.parts[0].text) ||
          '';

        return res.status(200).json({
          text,
          model,
          candidates: data.candidates
        });
      }

      lastStatus = response.status;
      lastData = data;

      // 503(과부하), 429(한도), 404(모델 없음), 5xx면 다음 모델로 즉시 우회
      if ([404, 429, 500, 502, 503, 504].includes(response.status)) {
        continue;
      }
      break;
    }

    return res.status(lastStatus).json({
      error: (lastData && lastData.error && lastData.error.message) || 'Gemini API 호출에 실패했습니다.',
      details: lastData
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || '서버 내부 오류' });
  }
};
