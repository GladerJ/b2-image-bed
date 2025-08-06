const B2 = require("backblaze-b2");
const crypto = require("crypto");

const B2_CONFIG = {
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  bucketId: process.env.B2_BUCKET_ID,
  endpoint: process.env.B2_ENDPOINT,
};

for (const key of [
  "B2_KEY_ID",
  "B2_APPLICATION_KEY",
  "B2_BUCKET_NAME",
  "B2_BUCKET_ID",
  "B2_ENDPOINT",
]) {
  if (!process.env[key]) {
    throw new Error("Missing required B2 environment variables");
  }
}

const b2 = new B2(B2_CONFIG);

function generateFileName(originalName) {
  const timestamp = Date.now();
  const randomStr = crypto.randomBytes(8).toString("hex");
  const ext = originalName.split(".").pop();
  return `${timestamp}-${randomStr}.${ext}`;
}

function getContentType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const types = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
  };
  return types[ext] || "application/octet-stream";
}

exports.handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // 解析上传的文件 (与之前相同的逻辑)
    const contentType = event.headers["content-type"];
    let fileBuffer, fileName, originalName;

    if (contentType && contentType.includes("multipart/form-data")) {
      const boundary = contentType.split("boundary=")[1];
      const body = Buffer.from(
        event.body,
        event.isBase64Encoded ? "base64" : "utf8"
      );

      const parts = body.toString("binary").split(`--${boundary}`);
      for (const part of parts) {
        if (
          part.includes("Content-Disposition: form-data") &&
          part.includes("filename=")
        ) {
          const lines = part.split("\r\n");
          const dispositionLine = lines.find((line) =>
            line.includes("Content-Disposition")
          );
          originalName = dispositionLine.match(/filename="([^"]+)"/)?.[1];

          const emptyLineIndex = lines.findIndex((line) => line === "");
          const fileContent = lines.slice(emptyLineIndex + 1, -1).join("\r\n");
          fileBuffer = Buffer.from(fileContent, "binary");
          break;
        }
      }
    } else {
      fileBuffer = Buffer.from(
        event.body,
        event.isBase64Encoded ? "base64" : "utf8"
      );
      originalName = event.headers["x-filename"] || "image.jpg";
    }

    if (!fileBuffer || !originalName) {
      throw new Error("No file data found");
    }

    // 验证文件类型
    const allowedTypes = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
    const fileExt = originalName.split(".").pop().toLowerCase();
    if (!allowedTypes.includes(fileExt)) {
      throw new Error("File type not allowed");
    }

    // 验证文件大小 (限制 10MB)
    if (fileBuffer.length > 10 * 1024 * 1024) {
      throw new Error("File too large (max 10MB)");
    }

    fileName = generateFileName(originalName);

    // 连接到 B2
    await b2.authorize();

    // 获取上传 URL
    const uploadUrlResponse = await b2.getUploadUrl({
      bucketId: B2_CONFIG.bucketId,
    });

    // 上传文件到 B2
    const uploadResponse = await b2.uploadFile({
      uploadUrl: uploadUrlResponse.data.uploadUrl,
      uploadAuthToken: uploadUrlResponse.data.authorizationToken,
      fileName: `images/${fileName}`,
      data: fileBuffer,
      info: {
        src_last_modified_millis: Date.now().toString(),
        original_name: originalName,
      },
      contentType: getContentType(fileName),
    });

    // 对于私有存储桶，我们返回一个访问图片的 API 端点
    const siteUrl = process.env.URL || `https://${context.headers.host}`;
    const fileUrl = `${siteUrl}/.netlify/functions/image?file=${fileName}`;

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        data: {
          url: fileUrl,
          filename: fileName,
          originalName: originalName,
          size: fileBuffer.length,
          uploadTime: new Date().toISOString(),
          note: "This is a proxy URL for private bucket access",
        },
      }),
    };
  } catch (error) {
    console.error("Upload error:", error);

    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        error: error.message || "Upload failed",
      }),
    };
  }
};
