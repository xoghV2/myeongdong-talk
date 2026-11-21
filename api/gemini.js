module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // 주소창에 /api/gemini를 열었을 때 한국어로 상태 확인
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({
      server: '정상 작동 중',
      apiKeyConnected: Boolean(apiKey),
      message: apiKey
        ? '완벽합니다! 서버와 API 키가 모두 연결되어 누구나 AI를 쓸 수 있어요.'
        : '서버는 고쳐졌어요! 이제 3단계대로 Vercel에 GEMINI_API_KEY만 넣어주세요.'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }

  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel에 GEMINI_API_KEY가 아직 등록되지 않았습니다.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

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

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: (data && data.error && data.error.message) || 'Gemini API 호출에 실패했습니다.',
        details: data
      });
    }

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
      candidates: data.candidates
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || '서버 내부 오류' });
  }
};
