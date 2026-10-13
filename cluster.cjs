const crypto = require('node:crypto')
const encoding = require('lib0/encoding')
const decoding = require('lib0/decoding')

const authorMessage = 3
function trusted(request, secret) {
  const value = request.headers['x-merhav-cluster-key']
  if (typeof value !== 'string' || !secret) return false
  const supplied = Buffer.from(value)
  const expected = Buffer.from(secret)
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)
}
function withAuthor(message, authorId) {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, authorMessage)
  encoding.writeVarString(encoder, authorId || '')
  encoding.writeVarUint8Array(encoder, message)
  return encoding.toUint8Array(encoder)
}
module.exports = { trusted, withAuthor, authorMessage, decoding }
