# eMenu Backend CORS Configuration Guide

## Quick Overview

eMenu backend uses serverless architecture with **AppSync GraphQL** + **Lambda Functions** + **S3 Storage**. CORS is configured at infrastructure level only.

## Core API Usage

### File Upload (2-Step Process)

#### Step 1: Get Presigned URL
```javascript
const getPresignedUrl = async (fileName, contentType, jwtToken) => {
  const response = await fetch('YOUR_LAMBDA_URL', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      authToken: jwtToken,     // JWT from Cognito
      fileName: fileName,      // "restaurant-logo.jpg"
      contentType: contentType // "image/jpeg"
    })
  });
  
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json(); // { presignedUrl, s3Key }
};
```

#### Step 2: Upload to S3
```javascript
const uploadFile = async (file, presignedUrl) => {
  const response = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
  });
  
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  return response;
};
```

### Complete React Example
```jsx
function FileUpload({ jwtToken }) {
  const [status, setStatus] = useState('');

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setStatus('Getting upload URL...');
      const { presignedUrl, s3Key } = await getPresignedUrl(
        file.name, file.type, jwtToken
      );

      setStatus('Uploading...');
      await uploadFile(file, presignedUrl);
      
      setStatus(`Success! File: ${s3Key}`);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div>
      <input type="file" onChange={handleUpload} />
      <p>{status}</p>
    </div>
  );
}
```

### GraphQL Operations
```javascript
// Configure AWS Amplify
import { Amplify } from 'aws-amplify';

Amplify.configure({
  aws_appsync_graphqlEndpoint: 'YOUR_APPSYNC_ENDPOINT',
  aws_appsync_region: 'ap-southeast-2',
  aws_appsync_authenticationType: 'AMAZON_COGNITO_USER_POOLS'
});

// GraphQL mutations work automatically with Cognito JWT
const CREATE_RESTAURANT = `
  mutation CreateRestaurant($input: CreateRestaurantInput!) {
    createRestaurant(input: $input) {
      id name logoUrl
    }
  }
`;
```

## Common Problems & Solutions

### Problem 1: CORS "Access-Control-Allow-Origin" Error
**Cause**: Multiple CORS configurations  
**Solution**: Remove CORS from Lambda code, keep only Terraform config

### Problem 2: "Method Not Allowed" on OPTIONS
**Cause**: Missing method in CORS config  
**Solution**: Ensure all methods in `allow_methods` list

### Problem 3: "Header Not Allowed"
**Cause**: Custom headers not in CORS policy  
**Solution**: Add required headers to Terraform CORS config

### Problem 4: 401 Unauthorized with Valid JWT
**Cause**: Wrong JWT format in request  
**Solution**: Check JWT format and Authorization header

## Current CORS Configuration

### Lambda Function URL (presigned_url_generator)
```terraform
# infra/main/lambda.tf
cors {
  allow_credentials = false
  allow_origins     = ["*"]                    # Dev: all origins
  allow_methods     = ["GET", "POST", "PUT", "DELETE", "HEAD", "PATCH"]
  allow_headers     = ["authorization", "content-type", "date", "keep-alive"]
  expose_headers    = ["date", "keep-alive"]
  max_age          = 86400
}
```

### S3 Bucket
```terraform
# infra/main/s3.tf
cors_rule {
  allowed_headers = ["*"]
  allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
  allowed_origins = ["*"]
  expose_headers  = ["ETag"]
  max_age_seconds = 3000
}
```

## Quick Testing

### Test with cURL
```bash
# Test presigned URL endpoint
curl -X POST YOUR_LAMBDA_URL \
  -H "Content-Type: application/json" \
  -d '{"authToken": "YOUR_JWT", "fileName": "test.jpg", "contentType": "image/jpeg"}'

# Test CORS preflight
curl -X OPTIONS YOUR_LAMBDA_URL \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST"
```

### Debug in Browser
1. Open DevTools → Network tab
2. Look for OPTIONS preflight requests
3. Check CORS headers in response
4. Verify no duplicate `Access-Control-Allow-Origin` headers

## Production Security

For production, update CORS to restrict origins:

```terraform
cors {
  allow_origins = [
    "https://yourdomain.com",
    "https://app.yourdomain.com"
  ]
  allow_methods = ["GET", "POST", "PUT", "DELETE", "HEAD"]
  allow_headers = ["authorization", "content-type"]
}
```

## Deploy Changes
```bash
cd infra/main
terraform plan
terraform apply
```

That's it! CORS is configured once in Terraform and works automatically.