-- Create content_pages table for managing static content
CREATE TABLE public.content_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_type TEXT NOT NULL UNIQUE CHECK (page_type IN ('privacy_policy', 'terms_conditions', 'about_us', 'support', 'faq')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  meta_description TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  last_updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_pages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for content_pages
CREATE POLICY "Admins can view all content pages"
ON public.content_pages FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update content pages"
ON public.content_pages FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert content pages"
ON public.content_pages FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete content pages"
ON public.content_pages FOR DELETE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view published content"
ON public.content_pages FOR SELECT
USING (is_published = true);

-- Create trigger for updated_at
CREATE TRIGGER update_content_pages_updated_at
BEFORE UPDATE ON public.content_pages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default content pages
INSERT INTO public.content_pages (page_type, title, content, meta_description, is_published) VALUES
  ('privacy_policy', 'Privacy Policy', 
   E'# Privacy Policy\n\nLast updated: ' || to_char(now(), 'Month DD, YYYY') || '\n\n## Introduction\n\nWe value your privacy and are committed to protecting your personal data. This privacy policy explains how we collect, use, and safeguard your information.\n\n## Information We Collect\n\nWe collect information that you provide directly to us, including:\n- Name and contact information\n- Payment information\n- Transaction history\n- Device and usage information\n\n## How We Use Your Information\n\nWe use the information we collect to:\n- Process your transactions\n- Provide customer support\n- Improve our services\n- Send you important updates\n- Comply with legal obligations\n\n## Data Security\n\nWe implement appropriate security measures to protect your personal information from unauthorized access, alteration, disclosure, or destruction.\n\n## Your Rights\n\nYou have the right to:\n- Access your personal data\n- Request corrections to your data\n- Request deletion of your data\n- Opt-out of marketing communications\n\n## Contact Us\n\nIf you have questions about this privacy policy, please contact our support team.',
   'Learn how we collect, use, and protect your personal information',
   true),
   
  ('terms_conditions', 'Terms and Conditions',
   E'# Terms and Conditions\n\nLast updated: ' || to_char(now(), 'Month DD, YYYY') || '\n\n## Acceptance of Terms\n\nBy accessing and using our platform, you accept and agree to be bound by these Terms and Conditions.\n\n## User Accounts\n\n### Registration\n- You must provide accurate and complete information\n- You are responsible for maintaining account security\n- You must not share your account credentials\n\n### Account Responsibilities\n- You are responsible for all activities under your account\n- Notify us immediately of any unauthorized use\n- We reserve the right to suspend or terminate accounts\n\n## Services\n\n### Airtime and Data\n- We facilitate the purchase of airtime and data bundles\n- Prices are subject to change\n- All sales are final unless otherwise stated\n\n### Payment Terms\n- All transactions must be funded from your wallet balance\n- Payments are processed securely\n- Transaction fees may apply\n\n## Prohibited Activities\n\nYou may not:\n- Use the service for illegal purposes\n- Attempt to breach security measures\n- Interfere with service operation\n- Resell services without authorization\n\n## Limitation of Liability\n\nWe are not liable for:\n- Service interruptions\n- Third-party network issues\n- Indirect or consequential damages\n\n## Changes to Terms\n\nWe reserve the right to modify these terms at any time. Continued use constitutes acceptance of updated terms.\n\n## Contact Information\n\nFor questions about these terms, please contact our support team.',
   'Read our terms and conditions for using our services',
   true),
   
  ('about_us', 'About Us',
   E'# About Us\n\n## Our Mission\n\nWe are committed to providing fast, reliable, and affordable digital services to our customers across Nigeria.\n\n## What We Offer\n\n### Airtime & Data\nPurchase airtime and data bundles for all major Nigerian networks instantly.\n\n### Bill Payments\nPay your electricity bills, cable TV subscriptions, and education services conveniently.\n\n### Virtual Account\nEach user gets a dedicated virtual account for easy wallet funding.\n\n## Why Choose Us\n\n### Fast & Reliable\nInstant delivery of services with 99.9% uptime.\n\n### Secure\nYour data and transactions are protected with bank-level security.\n\n### 24/7 Support\nOur support team is always available to assist you.\n\n### Best Rates\nCompetitive pricing with regular discounts and bonuses.\n\n## Our Values\n\n- **Integrity**: We operate with honesty and transparency\n- **Innovation**: We continuously improve our services\n- **Customer Focus**: Your satisfaction is our priority\n- **Excellence**: We strive for the highest quality\n\n## Contact Us\n\nHave questions? Reach out to our support team - we''re here to help!',
   'Learn more about our company and what we offer',
   true),
   
  ('support', 'Support',
   E'# Customer Support\n\n## How Can We Help?\n\nWe''re here to assist you with any questions or issues you may have.\n\n## Contact Methods\n\n### Email Support\nSend us an email and we''ll respond within 24 hours.\n\n### Live Chat\nChat with our support team for immediate assistance.\n\n### Phone Support\nCall us during business hours for urgent matters.\n\n## Frequently Asked Questions\n\n### Account & Registration\n**Q: How do I create an account?**\nA: Click on Sign Up, provide your details, and verify your email address.\n\n**Q: I forgot my password. What should I do?**\nA: Click on "Forgot Password" on the login page and follow the instructions.\n\n### Wallet & Payments\n**Q: How do I fund my wallet?**\nA: You can fund your wallet using your dedicated virtual account or through bank transfer.\n\n**Q: How long does it take for my wallet to be credited?**\nA: Wallet funding is usually instant but may take up to 15 minutes.\n\n### Services\n**Q: Can I get a refund?**\nA: Refunds are processed on a case-by-case basis. Contact support with your transaction details.\n\n**Q: Why did my transaction fail?**\nA: Transactions may fail due to insufficient balance, network issues, or invalid recipient details.\n\n## Report an Issue\n\nIf you''re experiencing technical difficulties:\n1. Clear your browser cache\n2. Try a different browser\n3. Check your internet connection\n4. Contact support if the issue persists\n\n## Business Hours\n\nMonday - Friday: 8:00 AM - 8:00 PM\nSaturday: 9:00 AM - 5:00 PM\nSunday: Closed\n\n## Feedback\n\nWe value your feedback! Let us know how we can improve our services.',
   'Get help and support for using our platform',
   true),
   
  ('faq', 'Frequently Asked Questions',
   E'# Frequently Asked Questions\n\n## General Questions\n\n### What is this platform?\nOur platform provides convenient access to purchase airtime, data bundles, pay bills, and manage digital services across Nigeria.\n\n### Is it safe to use?\nYes, we use bank-level encryption and security measures to protect your data and transactions.\n\n### Do I need to register?\nYes, you need to create an account to use our services.\n\n## Account Management\n\n### How do I verify my account?\nVerify your email address by clicking the link sent to your email after registration.\n\n### Can I change my phone number?\nYes, you can update your phone number in your profile settings.\n\n### How do I set up a transaction PIN?\nGo to Settings > Security and follow the instructions to set up your 4-digit PIN.\n\n## Wallet & Funding\n\n### How do I check my wallet balance?\nYour wallet balance is displayed on your dashboard.\n\n### What are the funding options?\nFund your wallet through your dedicated virtual account via bank transfer.\n\n### Are there any charges for funding?\nNo, there are no charges for funding your wallet.\n\n## Transactions\n\n### How quickly are transactions processed?\nMost transactions are processed instantly. Some may take up to 5 minutes.\n\n### Can I cancel a transaction?\nOnce a transaction is initiated, it cannot be cancelled. Contact support if you need assistance.\n\n### What if I entered the wrong number?\nDouble-check recipient details before confirming. We are not responsible for transactions sent to wrong numbers.\n\n## Services\n\n### Which networks do you support?\nWe support MTN, Glo, Airtel, and 9mobile.\n\n### Can I buy data for someone else?\nYes, you can purchase data for any phone number.\n\n### Do data bundles expire?\nYes, data bundles have validity periods set by the network providers.\n\n## Billing\n\n### How do I pay for electricity?\nSelect Electricity, choose your provider, enter your meter number, and complete the payment.\n\n### Can I pay for cable TV subscriptions?\nYes, we support DSTV, GOtv, and Startimes subscriptions.\n\n## Technical Issues\n\n### The website is not loading\nTry clearing your browser cache or using a different browser.\n\n### I didn''t receive my purchase\nCheck your transaction history. If the status is successful but you didn''t receive the service, contact support.\n\n### My payment was deducted but transaction failed\nYour wallet will be automatically refunded within 24 hours. Contact support if the issue persists.\n\n## Contact & Support\n\n### How do I contact support?\nUse our email, live chat, or phone support during business hours.\n\n### How long does support take to respond?\nWe aim to respond to all inquiries within 24 hours.',
   'Find answers to commonly asked questions',
   true);