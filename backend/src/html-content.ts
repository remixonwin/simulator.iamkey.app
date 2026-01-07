export const LANDING_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IAMKey | Privacy-First Identity</title>
    <style>
        :root {
            --bg: #0f172a;
            --primary: #6366f1;
            --secondary: #8b5cf6;
            --text: #f8fafc;
            --glass: rgba(255, 255, 255, 0.05);
        }
        body {
            margin: 0;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background: var(--bg);
            color: var(--text);
            overflow-x: hidden;
            line-height: 1.6;
        }
        .gradient-bg {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: 
                radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
                radial-gradient(circle at 90% 80%, rgba(139, 92, 246, 0.15) 0%, transparent 50%);
            z-index: -1;
        }
        nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 2rem 5%;
            backdrop-filter: blur(10px);
        }
        .logo {
            font-size: 1.5rem;
            font-weight: 700;
            background: linear-gradient(to right, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .hero {
            min-height: 80vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 0 1rem;
        }
        h1 {
            font-size: 4rem;
            margin-bottom: 1rem;
            line-height: 1.1;
            background: linear-gradient(to bottom right, #fff, #cbd5e1);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        p.subtitle {
            font-size: 1.25rem;
            color: #94a3b8;
            max-width: 600px;
            margin-bottom: 3rem;
        }
        .cta-button {
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: white;
            padding: 1rem 2.5rem;
            border-radius: 50px;
            font-weight: 600;
            text-decoration: none;
            transition: transform 0.2s, box-shadow 0.2s;
            box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
        }
        .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 30px rgba(99, 102, 241, 0.6);
        }
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            padding: 5rem 5%;
        }
        .card {
            background: var(--glass);
            padding: 2rem;
            border-radius: 20px;
            border: 1px solid rgba(255,255,255,0.1);
            transition: transform 0.3s;
        }
        .card:hover {
            transform: translateY(-5px);
            background: rgba(255, 255, 255, 0.08);
        }
        footer {
            text-align: center;
            padding: 3rem;
            border-top: 1px solid rgba(255,255,255,0.05);
            color: #64748b;
        }
        footer a {
            color: #94a3b8;
            text-decoration: none;
            margin: 0 1rem;
            transition: color 0.2s;
        }
        footer a:hover {
            color: var(--primary);
        }
        @media (max-width: 768px) {
            h1 { font-size: 2.5rem; }
        }
    </style>
</head>
<body>
    <div class="gradient-bg"></div>
    <nav>
        <div class="logo">IAMKey</div>
        <div>
            <a href="/privacy-policy" style="color:white; text-decoration:none; opacity:0.8;">Privacy</a>
        </div>
    </nav>

    <div class="hero">
        <h1>Your Identity,<br>Uncompromised.</h1>
        <p class="subtitle">The secure, privacy-first mobile identity solution. Protect your digital footprint with biometric precision.</p>
        <a href="https://play.google.com/store/apps/details?id=com.iamkey.id" class="cta-button">Get it on Google Play</a>
    </div>

    <div class="features">
        <div class="card">
            <h3>🔒 Maximum Security</h3>
            <p>Your private keys never leave your device. Protected by hardware-backed Keystore.</p>
        </div>
        <div class="card">
            <h3>🛡️ Social Recovery</h3>
            <p>Lost your phone? Recover your account securely with the help of trusted guardians.</p>
        </div>
        <div class="card">
            <h3>⚡ Instant Verification</h3>
            <p>Verify your identity across services without sharing sensitive personal data.</p>
        </div>
    </div>

    <footer>
        <p>&copy; 2025 IAMKey. All rights reserved.</p>
        <br>
        <a href="/privacy-policy">Privacy Policy</a>
        <a href="#">Terms of Service</a>
        <a href="mailto:support@iamkey.app">Contact</a>
    </footer>
</body>
</html>`;

export const PRIVACY_POLICY = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy Policy | IAMKey</title>
    <style>
        body {
            font-family: 'Inter', system-ui, sans-serif;
            line-height: 1.8;
            color: #333;
            max_width: 800px;
            margin: 0 auto;
            padding: 2rem;
            background: #fdfdfd;
        }
        h1 { color: #111; font-size: 2.5rem; margin-bottom: 0.5rem; }
        h2 { color: #222; margin-top: 2rem; }
        .last-updated { color: #666; font-style: italic; margin-bottom: 2rem; }
        ul { padding-left: 1.5rem; }
        a { color: #6366f1; text-decoration: none; }
        .back-link { display: inline-block; margin-bottom: 2rem; font-weight: 600; }
    </style>
</head>
<body>
    <a href="/" class="back-link">← Back to Home</a>
    
    <h1>Privacy Policy</h1>
    <p class="last-updated">Last Updated: January 6, 2026</p>

    <p>At <strong>IAMKey</strong> ("we," "our," or "us"), we prioritize your privacy above all else. This Privacy Policy explains how we collect, use, and protect your information when you use our mobile application and services.</p>

    <h2>1. Information We Collect</h2>
    <p>We believe in data minimization. We only collect what is strictly necessary for the app's functionality:</p>
    <ul>
        <li><strong>Phone Number</strong>: Used solely for account verification and unique identity creation.</li>
        <li><strong>Contacts (Optional)</strong>: If you choose to use our Social Recovery (Guardian) feature, we access selected contacts to send invitations. We do not upload your entire address book.</li>
        <li><strong>Device Information</strong>: We may collect device identifiers to ensure security and prevent fraud.</li>
    </ul>

    <h2>2. How We Use Your Information</h2>
    <ul>
        <li><strong>Identity Verification</strong>: To verify that you own your phone number.</li>
        <li><strong>Security</strong>: To secure your account using cryptography and biometrics.</li>
        <li><strong>Recovery</strong>: To enable you to recover access to your account via trusted guardians.</li>
    </ul>

    <h2>3. Data Storage and Security</h2>
    <p><strong>Your Private Keys never leave your device.</strong> Detailed personal data is stored locally on your device or in encrypted formats. We use industry-standard encryption for any data transmitted to our servers.</p>

    <h2>4. Third-Party Sharing</h2>
    <p>We do not sell, trade, or rent your personal identification information to others. We may use third-party service providers (e.g., Cloudflare, Firebase) strictly for hosting and notification infrastructure.</p>

    <h2>5. Your Rights</h2>
    <p>You have the right to request deletion of your data. You can perform a secure data deletion directly within the app settings or by contacting us at support@iamkey.app.</p>

    <h2>6. Changes to This Policy</h2>
    <p>We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page.</p>

    <h2>Contact Us</h2>
    <p>If you have any questions about this Privacy Policy, please contact us at <a href="mailto:support@iamkey.app">support@iamkey.app</a>.</p>
</body>
</html>`;
