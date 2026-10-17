// Express 4 does not catch rejected promises from async route handlers: a
// failing DB query would leave the request hanging forever. Wrap every async
// handler with this so errors reach the central error middleware in server.js.
module.exports = function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};
