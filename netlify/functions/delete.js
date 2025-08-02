const B2 = require('backblaze-b2');

// B2 配置 - 全部从环境变量读取
const B2_CONFIG = {
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  bucketId: process.env.B2_BUCKET_ID,
  endpoint: process.env.B2_ENDPOINT
};

// 验证必要的环境变量
if (!B2_CONFIG.applicationKeyId || !B2_CONFIG.applicationKey || !B2_CONFIG.bucketName || !B2_CONFIG.bucketId) {
  throw new Error('Missing required B2 environment variables');
}

const b2 = new B2(B2_CONFIG);

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'DELETE, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'DELETE') {
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
    const { filename } = JSON.parse(event.body);
    
    if (!filename) {
      throw new Error('Filename is required');
    }

    await b2.authorize();

    // 列出文件以获取 fileId
    const fileList = await b2.listFileNames({
      bucketId: B2_CONFIG.bucketId,
      startFileName: `images/${filename}`,
      maxFileCount: 1
    });

    if (!fileList.data.files || fileList.data.files.length === 0) {
      throw new Error('File not found');
    }

    const file = fileList.data.files[0];
    
    // 删除文件
    await b2.deleteFileVersion({
      fileId: file.fileId,
      fileName: file.fileName
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        message: 'File deleted successfully'
      })
    };

  } catch (error) {
    console.error('Delete error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Delete failed'
      })
    };
  }
};