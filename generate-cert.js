const forge = require('node-forge');
const fs = require('fs');

function generateCert() {
    console.log('Generating self-signed certificate...');
    
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    
    const attrs = [{
      name: 'commonName',
      value: 'localhost'
    }, {
      name: 'countryName',
      value: 'US'
    }, {
      shortName: 'ST',
      value: 'CA'
    }, {
      name: 'localityName',
      value: 'SF'
    }, {
      name: 'organizationName',
      value: 'Godot Mobile Client'
    }, {
      shortName: 'OU',
      value: 'Dev'
    }];
    
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    
    cert.sign(keys.privateKey);
    
    const pemPrivateKey = forge.pki.privateKeyToPem(keys.privateKey);
    const pemCert = forge.pki.certificateToPem(cert);
    
    fs.writeFileSync('key.pem', pemPrivateKey);
    fs.writeFileSync('cert.pem', pemCert);
    
    console.log('Certificate generated: key.pem, cert.pem');
    return { key: pemPrivateKey, cert: pemCert };
}

module.exports = { generateCert };
