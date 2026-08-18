import React from "react";
import { Link } from "react-router-dom";
import Logo from "@/components/oneforall/Logo";

const Section = ({ title, children }) => (
  <section className="space-y-3">
    <h2 className="text-xl font-semibold text-foreground">{title}</h2>
    <div className="space-y-3 text-muted-foreground leading-relaxed">{children}</div>
  </section>
);

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-5 py-10 space-y-10">
        <header className="space-y-4">
          <Link to="/" className="inline-flex items-center gap-3">
            <Logo size={40} />
            <span className="text-lg font-bold text-foreground">OneForAll</span>
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Effective date: 16 August 2026</p>
        </header>

        <Section title="Who we are">
          <p>
            OneForAll (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is an online marketplace that connects
            customers who need work done with verified local tradespeople (&ldquo;tradies&rdquo;) in Australia. This
            policy explains what personal information we collect through the OneForAll website and mobile app, how we
            use it, and the choices you have. We handle personal information in accordance with the Australian Privacy
            Principles under the Privacy Act 1988 (Cth).
          </p>
        </Section>

        <Section title="Information we collect">
          <p>
            <strong className="text-foreground">Account information.</strong> When you register we collect your name,
            email address and a password, or your basic Google account details if you sign in with Google. We may also
            collect and verify your mobile number.
          </p>
          <p>
            <strong className="text-foreground">Customer profile and service requests.</strong> If service requests are
            enabled, we collect your suburb and state and the details you provide — such as the description, category,
            timing and any photos. Requests are kept private and may be routed only to eligible providers.
          </p>
          <p>
            <strong className="text-foreground">Tradie profile and verification details.</strong> If you register as a
            tradie, we collect business information used to present and verify your profile: business name, ABN, trade
            categories, licence number and type, insurance provider and policy number, qualifications, years of
            experience, service areas and bio. Raw identity, licence and insurance evidence remains private. Only
            separately approved trust details may be shown to customers.
          </p>
          <p>
            <strong className="text-foreground">Messages and reviews.</strong> We store the messages you exchange with
            other users through the app, and the reviews and ratings you give or receive.
          </p>
          <p>
            <strong className="text-foreground">Usage and device information.</strong> Like most online services, we
            collect basic technical information such as device type, app version and interactions with the service, to
            keep the app working and improve it.
          </p>
        </Section>

        <Section title="How we use your information">
          <ul className="list-disc pl-5 space-y-2">
            <li>To operate managed fulfilment: reviewing requests, routing eligible providers and enabling private messaging.</li>
            <li>To verify tradie credentials and help keep the platform trustworthy.</li>
            <li>To send service notifications, such as new job invites, messages and account updates.</li>
            <li>To provide support, prevent fraud and abuse, and meet our legal obligations.</li>
          </ul>
          <p>We do not sell your personal information.</p>
        </Section>

        <Section title="When we share information">
          <p>
            Information is shared between users only as needed for the service to work — for example, a tradie&rsquo;s
            approved trust summary may be visible to a customer, and a customer&rsquo;s request details are shared only
            through a private managed pathway. We also share information with service providers who help us run OneForAll:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Supabase</strong> — our authentication, database and file-storage
              platform, which stores app data on our behalf.
            </li>
            <li>
              <strong className="text-foreground">Google</strong> — if you choose to sign in with Google.
            </li>
            <li>
              <strong className="text-foreground">OpenStreetMap</strong> — map tiles shown in the app are loaded from
              OpenStreetMap servers.
            </li>
          </ul>
          <p>
            These providers may store data outside Australia. We may also disclose information where required by law.
          </p>
        </Section>

        <Section title="How long we keep information">
          <p>
            We keep your information while your account is active. If you delete your account, we remove or de-identify
            your personal information within a reasonable period, except where we need to retain records to meet legal,
            tax or dispute-resolution obligations. Reviews may remain visible in de-identified form.
          </p>
        </Section>

        <Section title="Your rights and choices">
          <ul className="list-disc pl-5 space-y-2">
            <li>You can view and update your profile information in the app at any time.</li>
            <li>You can request a copy of the personal information we hold about you.</li>
            <li>You can ask us to correct inaccurate information or delete your account and data.</li>
            <li>You can opt out of non-essential notifications in the app settings.</li>
          </ul>
          <p>
            To exercise any of these rights, contact us using the details below. If you are not satisfied with our
            response, you can complain to the Office of the Australian Information Commissioner (OAIC) at{" "}
            <a href="https://www.oaic.gov.au" className="text-primary underline" target="_blank" rel="noreferrer">
              oaic.gov.au
            </a>
            .
          </p>
        </Section>

        <Section title="Security">
          <p>
            We take reasonable steps to protect your information, including encrypted connections (HTTPS), access
            controls that restrict each user&rsquo;s data to their own account, and reliance on established providers
            for authentication and payments. No online service can guarantee absolute security, so please use a strong,
            unique password.
          </p>
        </Section>

        <Section title="Children">
          <p>
            OneForAll is not directed at children and is intended for users aged 18 and over. We do not knowingly
            collect personal information from anyone under 18.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. If we make significant changes we will notify you through the
            app or by email. The effective date at the top shows when the policy was last revised.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            For privacy questions, requests or complaints, contact us at{" "}
            <a href="mailto:abed.karim@55mv.co" className="text-primary underline">
              abed.karim@55mv.co
            </a>
            .
          </p>
        </Section>

        <footer className="pt-6 border-t border-border">
          <Link to="/" className="text-sm text-primary underline">
            Back to OneForAll
          </Link>
        </footer>
      </div>
    </div>
  );
}
