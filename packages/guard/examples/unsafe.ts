// This file demonstrates policy violations caught by guard

const secret = process.env.API_KEY

// Violation: do not log secrets
console.log(secret)

function fetchData() {
  try {
    // do stuff
  } catch (e) {}
  // Violation: empty catch block swallows errors
}
