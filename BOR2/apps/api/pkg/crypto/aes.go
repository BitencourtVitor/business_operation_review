package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
)

// Encrypt encrypts plaintext using AES-256-GCM.
// keyHex must be a 64-char hex string (32 bytes).
// Returns a hex-encoded ciphertext (nonce prepended).
func Encrypt(plaintext, keyHex string) (string, error) {
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return "", errors.New("crypto: invalid key encoding")
	}
	if len(key) != 32 {
		return "", errors.New("crypto: key must be 32 bytes for AES-256")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	// Seal appends ciphertext+tag to nonce
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return hex.EncodeToString(sealed), nil
}

// Decrypt decrypts a hex-encoded ciphertext produced by Encrypt.
func Decrypt(ciphertextHex, keyHex string) (string, error) {
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return "", errors.New("crypto: invalid key encoding")
	}
	if len(key) != 32 {
		return "", errors.New("crypto: key must be 32 bytes for AES-256")
	}

	data, err := hex.DecodeString(ciphertextHex)
	if err != nil {
		return "", errors.New("crypto: invalid ciphertext encoding")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("crypto: ciphertext too short")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", errors.New("crypto: decryption failed — wrong key or corrupted data")
	}

	return string(plaintext), nil
}
