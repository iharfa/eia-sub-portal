import { handleUpload } from "@vercel/blob/client";

// Client-direct blob uploads: the browser asks here for a token, then PUTs the
// file straight to Blob storage — big shapefiles bypass the 4.5MB function cap.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async () => ({
        maximumSizeInBytes: 200 * 1024 * 1024, // ponytail: 200MB/file demo cap
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {},
    });
    return res.json(jsonResponse);
  } catch (e) {
    return res.status(400).json({ error: e.message || String(e) });
  }
}
