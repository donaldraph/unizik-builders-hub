// Direct Cognito API for the custom auth screens.
//
// This is a SECOND, parallel auth path. The hosted-UI PKCE flow in auth.jsx is
// untouched and remains the proven fallback. Everything here talks straight to
// Cognito via amazon-cognito-identity-js and produces the exact same JWTs
// ({ idToken, accessToken, refreshToken }) the rest of the app already expects.
//
// Sign-in uses SRP only. We deliberately do NOT fall back to USER_PASSWORD_AUTH:
// if SRP isn't enabled on the app client, signIn() throws SRP_NOT_ENABLED so the
// UI can tell the operator to enable ALLOW_USER_SRP_AUTH instead of silently
// downgrading to the weaker plaintext-password flow.

import {
  CognitoUserPool,
  CognitoUser,
  CognitoUserAttribute,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';
import { CONFIG } from './config';

const userPool = new CognitoUserPool({
  UserPoolId: CONFIG.userPoolId,
  ClientId: CONFIG.clientId,
});

const cognitoUser = (email) =>
  new CognitoUser({ Username: email, Pool: userPool });

// Pull the three JWTs out of a CognitoUserSession in the shape auth.jsx persists.
const sessionToTokens = (session) => ({
  idToken: session.getIdToken().getJwtToken(),
  accessToken: session.getAccessToken().getJwtToken(),
  refreshToken: session.getRefreshToken().getToken(),
});

// ---- Sign-up ---------------------------------------------------------------
export function signUp({ email, password, name }) {
  const attributes = [new CognitoUserAttribute({ Name: 'email', Value: email })];
  if (name) attributes.push(new CognitoUserAttribute({ Name: 'name', Value: name }));
  return new Promise((resolve, reject) => {
    userPool.signUp(email, password, attributes, null, (err, result) => {
      if (err) return reject(err);
      resolve({ userConfirmed: result.userConfirmed, user: result.user });
    });
  });
}

// ---- Email verification ----------------------------------------------------
export function confirmSignUp({ email, code }) {
  return new Promise((resolve, reject) => {
    cognitoUser(email).confirmRegistration(code, true, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

export function resendCode({ email }) {
  return new Promise((resolve, reject) => {
    cognitoUser(email).resendConfirmationCode((err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

// ---- Sign-in (SRP only) ----------------------------------------------------
export function signIn({ email, password }) {
  const user = cognitoUser(email);
  const details = new AuthenticationDetails({ Username: email, Password: password });
  return new Promise((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: (session) => resolve(sessionToTokens(session)),
      onFailure: (err) => reject(normalizeSrpError(err)),
      // Admin-created users land here. We don't drive the custom-auth screens
      // through a forced reset, so surface a clear, actionable error.
      newPasswordRequired: () =>
        reject(Object.assign(new Error('This account needs a password reset before sign-in.'), {
          code: 'NewPasswordRequired',
        })),
    });
  });
}

// ---- Forgot / reset password ----------------------------------------------
export function forgotPassword({ email }) {
  return new Promise((resolve, reject) => {
    cognitoUser(email).forgotPassword({
      onSuccess: resolve,
      onFailure: reject,
      inputVerificationCode: resolve, // code sent — proceed to reset view
    });
  });
}

export function confirmForgotPassword({ email, code, newPassword }) {
  return new Promise((resolve, reject) => {
    cognitoUser(email).confirmPassword(code, newPassword, {
      onSuccess: resolve,
      onFailure: reject,
    });
  });
}

// If SRP isn't enabled on the app client, Cognito rejects the InitiateAuth with
// a recognizable message. Tag it so the UI stops and asks the operator to enable
// ALLOW_USER_SRP_AUTH — never a silent USER_PASSWORD_AUTH fallback.
function normalizeSrpError(err) {
  const msg = String(err?.message || '');
  if (/SRP_AUTH is not enabled|Auth flow not enabled|not enabled for the client/i.test(msg)) {
    return Object.assign(new Error('SRP_NOT_ENABLED'), { code: 'SRP_NOT_ENABLED' });
  }
  return err;
}

// ---- Friendly error copy for every path -----------------------------------
export function cognitoErrorMessage(err) {
  // Network / fetch failure has no Cognito code.
  if (err?.code === 'SRP_NOT_ENABLED') {
    return 'Sign-in is not fully configured yet (SRP auth flow). Please contact an admin.';
  }
  if (err instanceof TypeError || /Failed to fetch|NetworkError|network/i.test(String(err?.message))) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  switch (err?.code || err?.name) {
    case 'NotAuthorizedException':
      return 'Email or password is incorrect.';
    case 'UserNotConfirmedException':
      return "Your email isn't verified yet — enter the code we sent you.";
    case 'UserNotFoundException':
      return "We couldn't find an account for that email.";
    case 'UsernameExistsException':
      return 'An account with this email already exists. Try signing in instead.';
    case 'CodeMismatchException':
      return "That code isn't right. Check it and try again.";
    case 'ExpiredCodeException':
      return 'That code has expired. Request a new one.';
    case 'InvalidPasswordException':
      return err.message?.replace(/^.*: /, '') || 'That password does not meet the requirements.';
    case 'InvalidParameterException':
      return err.message?.replace(/^.*: /, '') || 'Something in the form is invalid.';
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'NewPasswordRequired':
      return err.message;
    case 'CodeDeliveryFailureException':
      return "We couldn't send the verification email. Try again shortly.";
    default:
      return err?.message || 'Something went wrong. Please try again.';
  }
}

// Distinguishes the "needs verification" failure so the UI can switch to the
// verify view and pre-fill the email.
export const isUnconfirmed = (err) => (err?.code || err?.name) === 'UserNotConfirmedException';
