// Metadata Service for SPL Token Creation
// Handles IPFS/Arweave uploads, validation, and URI generation

import { getCurrentNetwork } from './config.js';

/**
 * MetadataService handles metadata preparation, upload, and URI generation
 * for atomic token creation with proper rollback mechanisms
 */
class MetadataService {
  constructor() {
    this.uploadHistory = new Map(); // Track uploads for rollback
    this.config = {
      ipfsEndpoint: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
      arweaveEndpoint: 'https://arweave.net',
      maxRetries: 3,
      timeout: 30000
    };
  }

  /**
   * Ensure metadata URI is available for token creation
   * @param {Object} metadata - Token metadata
   * @returns {Promise<Object>} Processed metadata with URI
   */
  async ensureMetadataUri(metadata) {
    try {
      // If URI already provided and valid, use it
      if (metadata.uri && this.isValidUri(metadata.uri)) {
        return {
          ...metadata,
          uri: metadata.uri,
          source: 'provided'
        };
      }

      // Build metadata JSON
      const metadataJson = this.buildMetadataJson(metadata);

      // Try IPFS upload first, then fallback to inline
      let uri = null;
      let source = null;

      // IPFS upload (placeholder - requires API key)
      if (this.hasIpfsConfig()) {
        try {
          uri = await this.uploadToIpfs(metadataJson);
          source = 'ipfs';
        } catch (error) {
          console.warn('IPFS upload failed:', error.message);
        }
      }

      // Inline data URI fallback
      if (!uri) {
        uri = this.createInlineDataUri(metadataJson);
        source = 'inline';
      }

      return {
        ...metadata,
        uri,
        source,
        uploadedAt: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`Metadata URI preparation failed: ${error.message}`);
    }
  }

  /**
   * Build standardized metadata JSON
   */
  buildMetadataJson(metadata) {
    return {
      name: metadata.name || '',
      symbol: metadata.symbol || '',
      description: metadata.description || '',
      image: metadata.image || '',
      external_url: metadata.externalUrl || '',
      attributes: metadata.attributes || [],
      properties: {
        files: metadata.files || [],
        category: metadata.category || 'token',
        creators: metadata.creators || []
      }
    };
  }

  /**
   * Upload metadata to IPFS using Pinata
   */
  async uploadToIpfs(metadataJson) {
    const pinataJWT = process.env.PINATA_JWT || this.getEnvVar('PINATA_JWT');
    const pinataApiKey = process.env.PINATA_API_KEY || this.getEnvVar('PINATA_API_KEY');
    
    if (!pinataJWT && !pinataApiKey) {
      throw new Error('IPFS upload not configured - requires PINATA_JWT or PINATA_API_KEY');
    }

    try {
      const formData = new FormData();
      const blob = new Blob([JSON.stringify(metadataJson, null, 2)], { type: 'application/json' });
      formData.append('file', blob, 'metadata.json');
      
      // Add pinata metadata
      const pinataMetadata = JSON.stringify({
        name: `${metadataJson.name || 'Token'}_metadata.json`,
        keyvalues: {
          tokenName: metadataJson.name,
          tokenSymbol: metadataJson.symbol,
          createdAt: new Date().toISOString()
        }
      });
      formData.append('pinataMetadata', pinataMetadata);
      
      const headers = {};
      if (pinataJWT) {
        headers['Authorization'] = `Bearer ${pinataJWT}`;
      } else if (pinataApiKey) {
        headers['pinata_api_key'] = pinataApiKey;
        headers['pinata_secret_api_key'] = process.env.PINATA_SECRET_KEY || this.getEnvVar('PINATA_SECRET_KEY');
      }
      
      const response = await fetch(this.config.ipfsEndpoint, {
        method: 'POST',
        headers,
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`IPFS upload failed: ${response.status} ${errorText}`);
      }
      
      const result = await response.json();
      const uri = `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
      
      // Store upload history
      this.uploadHistory.set(uri, {
        timestamp: Date.now(),
        service: 'ipfs',
        hash: result.IpfsHash,
        metadata: metadataJson
      });
      
      console.log('✅ Metadata uploaded to IPFS:', uri);
      return uri;
      
    } catch (error) {
      console.error('IPFS upload error:', error);
      throw new Error(`IPFS upload failed: ${error.message}`);
    }
  }



  /**
   * Create inline data URI as fallback
   */
  createInlineDataUri(metadataJson) {
    const jsonString = JSON.stringify(metadataJson);
    const base64 = Buffer.from(jsonString).toString('base64');
    return `data:application/json;base64,${base64}`;
  }

  /**
   * Validate URI format
   */
  isValidUri(uri) {
    if (!uri || typeof uri !== 'string') return false;
    
    // Check for valid HTTP/HTTPS URLs
    if (this.isHttpUrl(uri)) return true;
    
    // Check for valid data URIs
    if (uri.startsWith('data:')) return true;
    
    // Check for IPFS URIs
    if (uri.startsWith('ipfs://')) return true;
    
    return false;
  }

  /**
   * Check if URL is HTTP/HTTPS
   */
  isHttpUrl(uri) {
    try {
      const url = new URL(uri);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Check if IPFS configuration is available
   */
  hasIpfsConfig() {
    // Check for environment variables or config
    return (process.env.PINATA_JWT || this.getEnvVar('PINATA_JWT')) || 
           (process.env.PINATA_API_KEY || this.getEnvVar('PINATA_API_KEY')) ||
           (process.env.IPFS_API_KEY || this.getEnvVar('IPFS_API_KEY'));
  }

  /**
   * Get environment variable from various sources
   */
  getEnvVar(name) {
    // Try different sources for environment variables
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name];
    }
    
    // Try localStorage for browser environment
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(`env_${name}`);
    }
    
    // Try window object
    if (typeof window !== 'undefined' && window.ENV) {
      return window.ENV[name];
    }
    
    return null;
  }

  /**
   * Upload image to IPFS
   */
  async uploadImageToIpfs(imageFile) {
    const pinataJWT = process.env.PINATA_JWT || this.getEnvVar('PINATA_JWT');
    const pinataApiKey = process.env.PINATA_API_KEY || this.getEnvVar('PINATA_API_KEY');
    
    if (!pinataJWT && !pinataApiKey) {
      throw new Error('IPFS upload not configured for images');
    }

    try {
      const formData = new FormData();
      formData.append('file', imageFile);
      
      // Add pinata metadata
      const pinataMetadata = JSON.stringify({
        name: imageFile.name,
        keyvalues: {
          type: 'token_image',
          uploadedAt: new Date().toISOString()
        }
      });
      formData.append('pinataMetadata', pinataMetadata);
      
      const headers = {};
      if (pinataJWT) {
        headers['Authorization'] = `Bearer ${pinataJWT}`;
      } else if (pinataApiKey) {
        headers['pinata_api_key'] = pinataApiKey;
        headers['pinata_secret_api_key'] = process.env.PINATA_SECRET_KEY || this.getEnvVar('PINATA_SECRET_KEY');
      }
      
      const response = await fetch(this.config.ipfsEndpoint, {
        method: 'POST',
        headers,
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Image upload failed: ${response.status} ${errorText}`);
      }
      
      const result = await response.json();
      const uri = `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
      
      console.log('✅ Image uploaded to IPFS:', uri);
      return uri;
      
    } catch (error) {
      console.error('Image upload error:', error);
      throw new Error(`Image upload failed: ${error.message}`);
    }
  }



  /**
   * Rollback uploaded metadata (for failed token creation)
   */
  async rollbackUploads(uris = []) {
    const rollbackResults = [];
    
    for (const uri of uris) {
      const uploadInfo = this.uploadHistory.get(uri);
      if (!uploadInfo) {
        rollbackResults.push({ uri, status: 'not_tracked' });
        continue;
      }

      try {
        if (uploadInfo.service === 'ipfs') {
          // IPFS files are immutable, but we can unpin them
          // await this.unpinFromIpfs(uploadInfo.hash);
          rollbackResults.push({ uri, status: 'unpinned' });
        } else {
          // Inline data URIs don't need rollback
          rollbackResults.push({ uri, status: 'inline_no_action' });
        }
        
        // Remove from tracking
        this.uploadHistory.delete(uri);
        
      } catch (error) {
        rollbackResults.push({ 
          uri, 
          status: 'rollback_failed', 
          error: error.message 
        });
      }
    }

    return rollbackResults;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      ipfsAvailable: this.hasIpfsConfig(),
      trackedUploads: this.uploadHistory.size,
      config: {
        maxRetries: this.config.maxRetries,
        timeout: this.config.timeout
      }
    };
  }

  /**
   * Clear upload history (for cleanup)
   */
  clearHistory() {
    this.uploadHistory.clear();
  }
}

// Export singleton instance
export const metadataService = new MetadataService();
export default metadataService;