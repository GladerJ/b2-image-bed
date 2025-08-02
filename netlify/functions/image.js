// netlify/functions/image.js - 修复版本
const B2 = require('backblaze-b2');

const B2_CONFIG = {
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  bucketId: process.env.B2_BUCKET_ID,
  endpoint: process.env.B2_ENDPOINT
};

const b2 = new B2(B2_CONFIG);

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: 'Method not allowed'
    };
  }

  try {
    const fileName = event.queryStringParameters?.file;
    if (!fileName) {
      throw new Error('File parameter is required');
    }

    // 连接到 B2
    await b2.authorize();

    // 直接下载文件并返回
    const fileResponse = await b2.downloadFileByName({
      bucketName: B2_CONFIG.bucketName,
      fileName: `images/${fileName}`
    });

    // 确定内容类型
    const ext = fileName.split('.').pop().toLowerCase();
    const contentTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml'
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000', // 1年缓存
        'Content-Length': fileResponse.data.length.toString()
      },
      body: fileResponse.data.toString('base64'),
      isBase64Encoded: true
    };

  } catch (error) {
    console.error('Image access error:', error);
    
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Image not found or access denied',
        details: error.message
      })
    };
  }
};