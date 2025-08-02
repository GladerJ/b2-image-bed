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

    // 获取下载授权
    const downloadAuth = await b2.getDownloadAuthorization({
      bucketId: B2_CONFIG.bucketId,
      fileNamePrefix: `images/${fileName}`,
      validDurationInSeconds: 3600 // 1小时有效期
    });

    // 构建授权下载 URL
    const domain = B2_CONFIG.endpoint.replace('s3.', '');
    const authorizedUrl = `https://${B2_CONFIG.bucketName}.${domain}/file/${B2_CONFIG.bucketName}/images/${fileName}?Authorization=${downloadAuth.data.authorizationToken}`;

    // 重定向到授权 URL
    return {
      statusCode: 302,
      headers: {
        'Location': authorizedUrl,
        'Cache-Control': 'public, max-age=3600'
      },
      body: ''
    };

  } catch (error) {
    console.error('Image access error:', error);
    
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Image not found or access denied'
      })
    };
  }
};