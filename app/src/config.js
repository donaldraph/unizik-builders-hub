// Central config. Everything reads from here, nothing hardcodes an endpoint.
const env = import.meta.env;

export const CONFIG = {
  apiUrl: env.VITE_API_URL,
  cognitoDomain: env.VITE_COGNITO_DOMAIN,
  clientId: env.VITE_USER_POOL_CLIENT_ID,
  redirectUri: env.VITE_REDIRECT_URI || `${window.location.origin}/callback`,
  // Direct Cognito API (custom auth screens). The hosted-UI PKCE flow doesn't
  // need these; the amazon-cognito-identity-js path does.
  userPoolId: env.VITE_USER_POOL_ID,
  region: env.VITE_AWS_REGION || 'us-east-1',
};

// The builder tags — one source of truth, used by the register flow and the
// dashboard filter so they never drift apart.
export const TAGS = [
  { emoji: '☁️', name: 'Cloud Engineer', desc: 'Building on AWS and beyond' },
  { emoji: '💻', name: 'Software Developer', desc: 'Shipping products and features' },
  { emoji: '🔒', name: 'Security', desc: 'Protecting systems and data' },
  { emoji: '🤖', name: 'AI/ML', desc: 'Training models, solving problems' },
  { emoji: '📊', name: 'Data', desc: 'Turning numbers into decisions' },
  { emoji: '🎨', name: 'Designer', desc: 'Crafting interfaces and experiences' },
  { emoji: '🌱', name: 'Community Builder', desc: 'Growing people and programs' },
];

export const FACULTIES = [
  'Faculty of Agriculture', 'Faculty of Arts', 'Faculty of Basic Medical Sciences',
  'Faculty of Biosciences', 'Faculty of Education', 'Faculty of Engineering',
  'Faculty of Environmental Sciences', 'Faculty of Health Sciences and Technology',
  'Faculty of Law', 'Faculty of Management Sciences', 'Faculty of Medical Laboratory Sciences',
  'Faculty of Medicine', 'Faculty of Pharmaceutical Sciences', 'Faculty of Physical Sciences',
  'Faculty of Social Sciences', 'Faculty of Vocational Education',
];

export const LEVELS = ['100 Level', '200 Level', '300 Level', '400 Level', '500 Level', '600 Level', 'Postgraduate (MSc)', 'PhD'];
