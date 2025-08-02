const B2 = require('backblaze-b2');
const crypto = require('crypto');

// B2 配置 - 全部从环境变量读取
const B2_CONFIG = {
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  bucketId: process.env.B2_BUCKET_ID,
  endpoint: process.env.B2_ENDPOINT
};

// 验证必要的环境变量
if (!B2_CONFIG.applicationKeyId || !B2_CONFIG.applicationKey || !B2_CONFIG.bucketName || !B2_CONFIG.bucketId || !B2_CONFIG.endpoint) {
  throw new Error('Missing required B2 environment variables');
}

const b2 = new B2(B2_CONFIG);

// 生成唯一文件名
function generateFileName(originalName) {
  const timestamp = Date.now();
  const randomStr = crypto.randomBytes(8).toString('hex');
  const ext = originalName.split('.').pop();
  return `${timestamp}-${randomStr}.${ext}`;
}

// 获取文件类型
function getContentType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const types = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'svg': 'image/svg+xml'
  };
  return types[ext] || 'application/octet-stream';
}

exports.handler = async (event, context) => {
  // 处理 CORS 预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // 解析上传的文件
    const contentType = event.headers['content-type'];
    let fileBuffer, fileName, originalName;

    if (contentType && contentType.includes('multipart/form-data')) {
      // 处理 multipart/form-data
      const boundary = contentType.split('boundary=')[1];
      const body = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
      
      // 简单的 multipart 解析
      const parts = body.toString('binary').split(`--${boundary}`);
      for (const part of parts) {
        if (part.includes('Content-Disposition: form-data') && part.includes('filename=')) {
          const lines = part.split('\r\n');
          const dispositionLine = lines.find(line => line.includes('Content-Disposition'));
          originalName = dispositionLine.match(/filename="([^"]+)"/)?.[1];
          
          const emptyLineIndex = lines.findIndex(line => line === '');
          const fileContent = lines.slice(emptyLineIndex + 1, -1).join('\r\n');
          fileBuffer = Buffer.from(fileContent, 'binary');
          break;
        }
      }
    } else {
      // 处理直接上传的二进制数据
      fileBuffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
      originalName = event.headers['x-filename'] || 'image.jpg';
    }

    if (!fileBuffer || !originalName) {
      throw new Error('No file data found');
    }

    // 验证文件类型
    const allowedTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
    const fileExt = originalName.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(fileExt)) {
      throw new Error('File type not allowed');
    }

    // 验证文件大小 (限制 10MB)
    if (fileBuffer.length > 10 * 1024 * 1024) {
      throw new Error('File too large (max 10MB)');
    }

    // 生成新文件名
    fileName = generateFileName(originalName);

    // 连接到 B2
    await b2.authorize();

    // 获取上传 URL
    const uploadUrlResponse = await b2.getUploadUrl({
      bucketId: B2_CONFIG.bucketId
    });

    // 上传文件到 B2
    const uploadResponse = await b2.uploadFile({
      uploadUrl: uploadUrlResponse.data.uploadUrl,
      uploadAuthToken: uploadUrlResponse.data.authorizationToken,
      fileName: `images/${fileName}`,
      data: fileBuffer,
      info: {
        'src_last_modified_millis': Date.now().toString(),
        'original_name': originalName
      },
      contentType: getContentType(fileName)
    });

    // 构建文件访问 URL - 使用环境变量中的 endpoint
    const domain = B2_CONFIG.endpoint.replace('s3.', '');
    const fileUrl = `https://${B2_CONFIG.bucketName}.${domain}/images/${fileName}`;

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        data: {
          url: fileUrl,
          filename: fileName,
          originalName: originalName,
          size: fileBuffer.length,
          uploadTime: new Date().toISOString()
        }
      })
    };

  } catch (error) {
    console.error('Upload error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Upload failed'
      })
    };
  }
};