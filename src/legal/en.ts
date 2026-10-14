// The legal pages in English. The Finnish texts (fi.ts) are the main ones; this follows them.

import { FIGURES as F, OPERATOR as O, euros, gigas, percent, type LegalTexts } from './common';

const e = (cents: number) => euros(cents, 'en');
const pct = (x: number) => percent(x, 'en');
const gb = (b: number) => gigas(b, 'en');
const L = F.lite;
const hours = (ms: number) => ms / (60 * 60 * 1000);
const ex = F.example;

export const en: LegalTexts = {
  draft: 'Draft: to be reviewed by a lawyer before launch',
  effective: `In effect from ${O.effective}`,
  back: 'Back',
  labels: {
    terms: 'Terms of use',
    privacy: 'Privacy',
    refunds: 'Withdrawal and refunds',
    rules: 'Content rules',
    contact: 'Contact',
  },
  docs: {
    // ---------------- terms of use ----------------
    terms: {
      title: 'Terms of use',
      lead: 'These terms are an agreement between you and the operator of Dear to Me. They cover using the service, posting, buying and selling. If the Finnish and English versions differ, the Finnish version prevails.',
      sections: [
        {
          title: '1. The operator',
          body: [
            `Dear to Me (D2M, we) is operated by ${O.name} (business ID ${O.businessId}), ${O.address}, Finland. Email: ${O.email}. All contact details are on the Contact page.`,
          ],
        },
        {
          title: '2. What D2M is',
          body: [
            'D2M is a social service for your own friends. In it you can:',
            [
              'write long-form blogs and post vlogs (videos);',
              'talk live under every post;',
              'write a letter, a post for one friend;',
              'leave a BoVNote in a post, a hidden note for readers you choose;',
              'post publicly, so the post can be shown to every user on the For You page;',
              'make yourself a public profile;',
              'start groups and write to them: private friend groups and open interest groups;',
              'on the paid plans, sell your posts to readers.',
            ],
            'For every post you choose who sees it: your friends, readers you pick, or everyone (public). A letter is seen only by the friend you wrote it to.',
            'A public post and a public profile are visible to anyone, including people without an account, and search engines can find them. Of a paid post, only its opening is shown without a subscription or a purchase. A public post’s conversation is public in the same way: anyone can read its messages and the names and profile pictures of those who wrote them, but only a signed-in user can write in it.',
            'A friend group is private: only its members see it, its members and its posts with their conversations. One joins only by accepting an invitation, and invites only one’s own friends (a member’s suggestion is approved by an admin). An interest group is open: everyone signed in sees it and its posts with their conversations, and anyone signed in may join. Groups and their posts are never shown without an account nor to search engines, and they are not public posts: they have no topics, are not on the For You page, and cannot be paid. A member who leaves or is removed no longer sees a friend group’s posts; a new member sees the earlier ones too.',
            'D2M has no ads, no analytics and no tracking.',
          ],
        },
        {
          title: '3. Your account',
          body: [
            'To create an account you need a display name, a username, an email address and a password. The account is personal: do not share your password. You are responsible for what is done with your account, unless someone got into it through no fault of yours.',
            'You must be at least [age limit] years old to use the service. A minor needs a guardian\'s permission for paid purchases.',
            'Your display name, your username (@username) and your profile picture are visible to other users, for example in search and in friend lists. A username is unique; if you change it, the old one stays reserved for you for 30 days, and no one else can take it meanwhile.',
            'You can stop using the service at any time, and delete your account yourself in My place (Delete account) with your password. All your monthly payments then end at once, so do your readers\' monthly subscriptions to you, and your account, profile, posts with their files, messages in every conversation, BoVNotes, friendships, subscriptions and reports are deleted. Of your purchases only the Stripe identifiers, amounts and times are kept for accounting, without who made them. What you have already earned is still paid out to your Stripe account through Stripe.',
            `Deleting the account does not refund a period already paid for and does not cancel payments already due. To withdraw from a monthly contract made in the last ${F.withdrawalDays} days and get the unused part back, use Withdraw from a contract before deleting the account. If you delete your account, the posts you sold go too, and their purchases of the last ${F.refundDays} days are refunded to the buyers (see section 10).`,
          ],
        },
        {
          title: '4. Content and its rules',
          body: [
            'Not allowed in the service:',
            [
              'sexual content in any form, also in private posts, letters and BoVNotes: pornography, sexually explicit or suggestive pictures, videos and texts, and offering sexual services. You may write about your own intimate life, such as relationships, feelings, health or the body (see the Content rules);',
              'AI-made content in any form, also in private posts and letters: text, pictures, video or voice made wholly or mainly with generative AI, and always deepfakes of real people;',
              'illegal content, for example material that infringes someone\'s copyright, defamation, illegal threats, incitement to hatred against a group, and spreading information that violates someone\'s privacy;',
              'harassment, bullying and threatening others.',
            ],
            'When you post publicly, you confirm that the post is your own work, not made with AI, and has no sexual content. The detailed rules are on the Content rules page and are part of these terms.',
            'The same rules apply in groups. When you write to an interest group, you confirm the same way that the post is your own work, not made with AI, and has no sexual content. Whoever starts a group is its admin. An admin can invite members, remove members, make others admins, change the group’s name and description, remove posts from the group and delete the whole group with its posts; an interest group’s admin can also ban a user from joining and talking in it. Admins are users, not D2M’s moderators: their decisions come with no statement of reasons, but a group’s posts can be reported like any other, and D2M’s moderation applies to them the same way (section 5). The last admin leaving names who follows them or deletes the group; if they delete their account, a friend group is deleted with its posts and an interest group passes to its longest-standing member.',
            'You are responsible for what you post. We do not check content in advance.',
          ],
        },
        {
          title: '5. Reporting and removal',
          body: [
            'A signed-in user can report a post with its Report button, for sexual content, AI-generated content or something else. When three different users have reported the same post, it is taken off the For You page automatically until a moderator has handled it. This is the only automatic step in the service.',
            `Anyone, also without an account, can report illegal content or content against the rules with the {notice form|/report-content}: the address of the content, which rule it breaks and why, your email address, and a statement that the information is accurate. You get a confirmation by email. You can also report by email to ${O.email}. A report of child sexual abuse material does not need a name.`,
            'Reports are handled without delay by a person, a moderator of the service. The moderator sees the reported post whole, even one written for friends only. They may keep the post (the reports are cleared and it comes back to For You), remove it (its content and files are deleted), restrict it (only you see it, until a moderator lifts the restriction), or suspend the account (section 11). Every decision has a written reason.',
            'When your post is removed or restricted or your account suspended, you get a statement of reasons by email: what was decided, which rule was broken, the facts it rests on (for example how many reports, and why), that a person made the decision, and how to complain. We tell the person who reported what was done with their report by email, without telling them anything of the author.',
            `You can complain about a decision about you for ${F.complaintMonths} months after it: with the link in the statement of reasons, which works once also without signing in, or signed in on the decision's page. A person handles the complaint and may make another decision, and we tell you the outcome by email. A removed post's content cannot be brought back even if the decision is reversed, because it has been deleted; you may publish it again. The person who reported can ask us to review the decision by writing to us. You can also take the matter to an out-of-court dispute settlement body under the Digital Services Act, or to a court.`,
            'If content suggests a crime that threatens someone\'s life or safety, we report it to the authorities. Content that sexualises children we always report to the police.',
          ],
        },
        {
          title: '6. Your rights to your content',
          body: [
            'What you post is yours. We do not own it and do not sell it on.',
            'You give us a free, non-exclusive licence to store, copy and process your content technically (for example to make a smaller viewing copy of a video) and to show it, but only as far as needed to show it to the readers you have chosen. We do not use your content for advertising or any other purpose.',
            'The licence ends when the post is removed, whether you delete it or its time is up. For technical reasons deleted data may remain in backups for at most [backup retention], after which it is gone from them too.',
            'Only post content you have the right to post. If other people appear in a post, make sure they agree.',
          ],
        },
        {
          title: '7. Plans',
          body: [
            `There are three plans. Prices include value added tax (Finnish VAT ${pct(F.vat)}).`,
            [
              `Lite is free. Posts disappear: a blog after ${hours(L.blogLife)} hours (at most ${L.blogsPer24h} a day), a vlog after ${hours(L.vlogLife) / 24} days (${L.vlogsPer24h} a day, at most ${L.vlogMaxSeconds / 60} minutes) and a letter after a week. Storage: ${gb(F.storage.lite.video)} for videos and ${gb(F.storage.lite.media)} for text and pictures.`,
              `Unlimited costs ${e(F.unlimitedPrice)} a month. You choose how long each post stays up, and posts whose time is up go to your archive. Storage: ${gb(F.storage.unlimited.video)} for videos and ${gb(F.storage.unlimited.media)} for text and pictures, and you can buy more. You can sell readers a monthly subscription to your paid public posts (at most ${e(F.maxSubscription)} a month).`,
              `Exclusive costs ${e(F.exclusivePrice)} a month. It has everything in Unlimited, but instead of a monthly subscription you sell posts one by one: a blog for at most ${e(F.post.blogMax)} and a vlog for at most ${e(F.post.vlogMax)}; a vlog for sale must be at least ${F.post.vlogMinSeconds / 60} minutes long. Readers pay no monthly fee. Storage: ${gb(F.storage.exclusive.video)} for videos and ${gb(F.storage.exclusive.media)} for text and pictures.`,
            ],
            `On the paid plans you can buy more storage in monthly packs: ${gb(F.packs.video.bytes)} for videos at ${e(F.packs.video.price)}/month or ${gb(F.packs.media.bytes)} for text and pictures at ${e(F.packs.media.price)}/month.`,
            'On Lite a post is deleted for good when its time is up. Keep your own copy of texts and videos that matter to you.',
          ],
        },
        {
          title: '8. Payments, renewal and cancelling',
          body: [
            'Payments are handled by the payment service Stripe (Stripe Checkout). You enter your card details on Stripe\'s payment page, and they never reach D2M\'s servers.',
            'Unlimited, Exclusive, extra storage and a reader\'s monthly subscription to an author are monthly payments. They are charged first when you buy and then automatically every month until you cancel.',
            'Before you go to the payment page, you give your express consent in the service to getting what you buy at once (see Withdrawal and refunds). The time of the consent is recorded with the purchase. The confirmation of the payment comes as Stripe\'s email receipt, and the purchase shows in the Purchases list in My place.',
            'You can end a paid plan at any time by switching back to Lite in My place. The monthly payments for the plan and for extra storage then end at once, and no further charges are made. The month already paid for is not refunded, unless the right of withdrawal or consumer law requires it. Once you are back on Lite, posts whose time runs out are deleted as on Lite.',
            'You can cancel a monthly subscription to an author on their profile or in search (Cancel subscription). It then no longer renews, and you keep access to the author\'s paid posts until the end of the period paid for. The service shows until when it stays open.',
            `If an author stops selling their monthly subscription (leaves Unlimited, removes the subscription\'s price or deletes their account) or their account is suspended, the readers\' subscriptions to them end at once and no further charges are made. For a period already paid for you can ask for a credit at ${O.email}. The right of withdrawal and refunds are explained on the Withdrawal and refunds page.`,
            'If prices change, we tell you at least 30 days in advance. The change applies only to billing periods after the notice, and you can cancel before it takes effect.',
          ],
        },
        {
          title: '9. Buying from an author',
          body: [
            'A monthly subscription to an Unlimited author gives access to their paid public posts for as long as the subscription runs. An Exclusive author\'s post is bought once, and the purchase gives access to the post and its conversation for as long as the post is up in the service. The author decides how long the post stays up. Before buying you see until when the post can be read, or that it is permanent.',
            'Purchases are paid to D2M through Stripe, and D2M passes the author\'s share on to them.',
          ],
        },
        {
          title: '10. Selling as an author',
          body: [
            'To sell, you link a Stripe Connect Express account to your account. Stripe verifies your identity and pays your earnings into your bank account. Stripe\'s own terms (the Stripe Connected Account Agreement) apply to that account.',
            `The price you set is what the buyer pays, and it includes VAT. From each sale D2M keeps the VAT, which it reports and pays, and a platform fee of ${pct(F.fee)} of the price without VAT. The rest is transferred to your Stripe account. Example: of a ${e(ex.price)} sale, VAT is ${e(ex.vat)}, the platform fee ${e(ex.fee)} and your share ${e(ex.author)}. Stripe may charge its own fees on transfers and payouts to your account.`,
            'You are responsible for income tax on your earnings and for your own other taxes and obligations. We do not file tax returns for you.',
            'Only sell content you made yourself or have the right to sell. Tell readers honestly what they are buying.',
            `If you delete a post you sold within ${F.refundDays} days of a purchase (also by deleting your account), the buyer gets the whole price back automatically. When you stop selling your monthly subscription, your readers\' subscriptions to you end at once.`,
            `If a moderator removes a post you sold because it breaks the content rules or the law, its buyers are not refunded automatically (the ${F.refundDays}-day refund applies only to posts you delete yourself).`,
            'If a buyer gets their money back (for example through the right of withdrawal, a post you deleted or a defect, or at their request for a post against the rules), your share of that sale is reclaimed from your Stripe account, and D2M gives back its own share.',
          ],
        },
        {
          title: '11. Suspending accounts',
          body: [
            'We may suspend your account for a set time or until further notice if you seriously or repeatedly break these terms or the law, for example by posting sexual or AI-made content. A person always decides a suspension, and you get a statement of reasons by email, unless the law or other people\'s safety prevents it. For breaches that are not serious, we warn you first.',
            'While suspended you cannot sign in (signing in shows you why, and a link to complain), your sessions end, and your profile and posts are not shown to others. Nothing is deleted, and an account is never deleted automatically. Your readers\' monthly subscriptions to you end at once and are no longer charged. Your own monthly payments (your plan, extra storage and your subscriptions to other writers) do not renew, and what you paid for runs to its end; once the suspension is over you can subscribe again.',
            'You can complain about a suspension like any other decision (section 5). When a suspension ends or is reversed, you can sign in again, and your profile and posts show again.',
          ],
        },
        {
          title: '12. Liability',
          body: [
            'We try to keep the service running and your data safe. Still, there may be interruptions, for example for maintenance or technical faults. We announce planned breaks in advance when we can.',
            'We are not responsible for content posted by users, but we remove illegal content once we learn of it.',
            'We are not liable for indirect damage, such as lost income, unless it is caused by our negligence.',
            'These limits do not apply to damage caused intentionally or by gross negligence, and they do not limit your rights under the Finnish Consumer Protection Act or other mandatory law. If a paid service is not as promised, you have the rights consumer law gives you: to have the defect fixed, a price reduction or to end the contract.',
          ],
        },
        {
          title: '13. Changes to these terms',
          body: [
            'We may change these terms, for example when the service, the law or the prices change. We tell you about significant changes by email or in the service at least 30 days before they take effect. If you do not accept a change, you can stop using the service and cancel paid plans before it takes effect.',
          ],
        },
        {
          title: '14. Law and disputes',
          body: [
            'These terms are governed by Finnish law. If you live in another EU country, you also keep the protection of the mandatory consumer law of your country.',
            `Contact us first (${O.email}) and we will try to settle the matter. As a consumer you can get free advice from the Finnish consumer advisory service (kuluttajaneuvonta.fi) and take the dispute to the Consumer Disputes Board, Kuluttajariitalautakunta (kuluttajariita.fi). The Board\'s decisions are recommendations. If you live in another EU country, you can also turn to the European Consumer Centre (kuluttajaneuvonta.fi/eck).`,
            'A consumer may also bring a claim in the district court of their own home municipality.',
          ],
        },
      ],
    },

    // ---------------- privacy policy ----------------
    privacy: {
      title: 'Privacy policy',
      lead: 'This policy explains what personal data D2M processes, why and on what basis, who receives it and what rights you have (the EU General Data Protection Regulation, GDPR).',
      sections: [
        {
          title: '1. Controller',
          body: [`${O.name}, business ID ${O.businessId}, ${O.address}, Finland.`, `Privacy matters: ${O.email}.`],
        },
        {
          title: '2. What we process and why',
          body: [
            'We process only the data the service needs. We use no advertising, no analytics and no tracking, and we sell data to no one.',
            [
              'Account: display name, username (public), email address and password (stored only as a hash, never in plain text). Purpose: creating the account, signing in and contacting you about the service. Basis: contract (GDPR Art. 6(1)(b)).',
              'Email messages: we send your email address only messages the service needs: a link to confirm your address after you sign up, a password reset link when one is asked for, when you change your email address a confirmation link to the new address and a notice to the old one, and moderation\'s messages (a statement of reasons, what was done with your report, the outcome of a complaint). We store when your address was confirmed and, for links still valid, only a hash of the link\'s token, the address it was sent to and when it expires (a confirmation link after 24 hours, a reset link after one hour). Buying, selling and a public profile need a confirmed address. We send no marketing. Purpose: making sure the address is yours, and getting you back into your account. Basis: contract.',
              'Invite code: during the closed test phase (beta), the invite code you joined with is stored with your account. Purpose: running the test phase, for example seeing how testers came in. Basis: legitimate interest (Art. 6(1)(f)).',
              'Profile: profile picture, wallpaper, bio and whether your profile is public. Purpose: showing your profile to those you have chosen. Basis: contract.',
              'Friends: whom you have added as friends. Basis: contract.',
              'Interests: the topics you chose and up to ten words of your own, and whether you have already answered or skipped the question about them after signing up. Only you see them: they are not shown on your profile or to anyone else. Purpose: ordering the public posts on your For You page. The ordering uses only the interests you chose and the public side of the posts (title, text, topics, age and the number of messages in the conversation), and whether the author is your friend. What you read or open is not used for it, and nothing about your use is recorded for it. Basis: contract.',
              'Topics of public posts: the topics their author chose or, if they chose none, topics read from the title and text with word lists. Purpose: the For You page and search by topic. Basis: contract.',
              'Groups: the groups you start (name, description, a friend group’s picture, an interest group’s topic), your memberships and roles in them (member or admin) and when you joined, invitations (who was invited, by whom and when) and interest groups’ bans. A friend group’s members see each other and the invitations waiting; an interest group’s member list is seen only by its admins (others see how many members it has, and its admins). Purpose: running the groups. Basis: contract.',
              'Content: blogs, vlogs, pictures, letters, BoVNotes, conversation messages, who can see a post, how long it lives, and whether a BoVNote has been seen. For videos we read the length and make a smaller viewing copy. Purpose: storing your content and showing it to the readers you chose. Basis: contract.',
              'Purchases and subscriptions: your plan, extra storage, subscriptions to authors and posts bought, and Stripe identifiers (of the checkout session, the subscription, the payment and the Connect account). Every purchase is kept in a purchases log: its kind, the Stripe identifiers, the amount, when it was made, when you gave your express consent, and any withdrawal and refund. We never receive or process card details. Purpose: charging payments, unlocking what was bought, paying authors, withdrawals and refunds, and evidence of your consent. Basis: contract; the data accounting needs and the evidence of consent: legal obligation (Art. 6(1)(c), the Finnish Accounting Act, VAT Act and Consumer Protection Act).',
              'Reports: who reported a post, when and for what reason (sexual content, AI-generated content or something else). For notices sent with the notice form without an account: the sender\'s email address, the address of the content, the rule and the explanation. Purpose: enforcing the content rules and removing illegal content. Basis: our legitimate interest in keeping the service safe (Art. 6(1)(f)) and the obligations of the Digital Services Act (EU 2022/2065) (Art. 6(1)(c)).',
              'Moderation: decisions (what was decided, the title and identifier of the post or the username of the account, the rule broken, the written reason, the facts, that is the numbers of reports by reason, which moderator decided and when; never the post\'s content), suspensions (reason and length), complaints (their text and the email address the outcome goes to), a hash of the complaint link\'s token, and the moderation log (every moderation action: who, when, what and why). Purpose: statements of reasons, handling complaints, and accountability for every action. Basis: the obligations of the Digital Services Act (Art. 6(1)(c)) and legitimate interest (Art. 6(1)(f)).',
              'Technical data: IP address and browser details in requests to the server, and the session cookie. Purpose: delivering the service and security, such as preventing abuse. Basis: legitimate interest (Art. 6(1)(f)). [Server logs: what is kept and for how long.]',
            ],
            'The data comes from you, from other users (for example when someone adds you as a friend or writes you a letter) and from Stripe (the status of a payment).',
          ],
        },
        {
          title: '3. Who sees the data',
          body: [
            'Other users see your display name, your username and your profile picture and the posts you have chosen for them. Public posts and a public profile are visible to anyone, including people without an account, and search engines can find them. When you write in a public post’s conversation, your message and your display name, username and profile picture are visible to anyone in the same way. Your email address, your letters, your BoVNotes, the posts you limited to your friends, and whether you are in a conversation right now are never shown to anyone without an account. A friend group’s posts and their conversations are seen only by its members; an interest group’s by everyone signed in, but not by people without an account nor by search engines. Moderators see a reported post whole, even one written for friends only, for a group or as a letter, and its author, so they can handle the report; otherwise our staff look at data only when needed to run the service.',
          ],
        },
        {
          title: '4. Processors and other recipients',
          body: [
            'We use the following providers. They process data on our behalf under a contract and may not use it for their own purposes, unless stated otherwise.',
            [
              'Stripe (Stripe Payments Europe Ltd, Ireland): payments and authors\' Connect accounts. Stripe processes payment and card data and is in some respects an independent controller (for example fraud prevention, identity checks under anti-money-laundering law, and authors\' Connect accounts). Stripe\'s privacy policy: stripe.com/privacy.',
              'Cloudflare (Cloudflare, Inc.): storage of uploaded pictures and videos (Cloudflare R2). The files are in private storage and can only be reached through short-lived signed addresses.',
              'Cloudflare (Cloudflare, Inc.): sending the service\'s email messages (Cloudflare Email Service). Cloudflare processes the recipient\'s email address and the content of the message to deliver it.',
              `${O.host}: the server the app and the other data run on (${O.hostLocation}).`,
            ],
            'We may disclose data to authorities when the law requires it.',
          ],
        },
        {
          title: '5. Transfers outside the EU and EEA',
          body: [
            'Stripe and Cloudflare are international companies whose groups include US companies, so data may also be processed outside the EU and EEA. Such transfers rely on the standard contractual clauses approved by the European Commission or, where the recipient is certified under the EU-US Data Privacy Framework, on the Commission\'s adequacy decision. [Check each provider\'s current transfer mechanism, the R2 bucket\'s location and where Cloudflare Email Service processes messages.]',
          ],
        },
        {
          title: '6. How long data is kept',
          body: [
            [
              'Lite posts are deleted when their time is up: a blog after a day, a vlog after two days and a letter after a week.',
              'On a paid plan, posts whose time is up stay in your archive, which only you see, until you delete them.',
              'When a post is deleted, its pictures and videos, its conversation, its BoVNotes and the reports about it are deleted with it.',
              'When a group is deleted, its posts are deleted the same way, and its memberships, invitations and bans with it. When you delete your account, your memberships, invitations and bans are deleted; a group you were the last admin of is deleted with its posts (a friend group, or an empty interest group), or an interest group passes to its longest-standing member.',
              'Account data is kept until you delete the account (My place > Delete account). A username changed away from is kept for 30 days after the change, so that no one else can take it at once, and it is deleted with the account at the latest. Then your account and sessions, your interests, your profile and its pictures, your posts with their files, your messages in every conversation, your BoVNotes, friendships, subscriptions both ways, access to posts you bought and the reports you made are deleted at once. The purchases log keeps its rows for accounting without your identifier: only the Stripe identifiers, amounts and times.',
              'An email link\'s data is deleted when the link is used or a new one is asked for in its place, and expired ones are deleted regularly; all of it goes with the account at the latest. The invite code is kept with the account and deleted with it.',
              `Reports are kept for ${F.reportMonths} months and then deleted automatically. A post\'s reports go earlier, once a moderator has handled them or the post is deleted. Notices sent with the notice form are kept for ${F.reportMonths} months.`,
              `Moderation decisions (without the post\'s content) and complaints about them are kept for ${F.complaintMonths} months after the decision, the time to complain; longer only while a complaint is still open or a suspension it made lasts. They are kept that long even if the account is deleted: then without the account\'s identifier, but with the username. The moderation log is kept for ${F.auditMonths} months.`,
              'Payment and accounting records are kept as the Finnish Accounting Act requires: six years from the end of the year in which the financial period ended.',
              'Data deleted from the service is gone from backups after at most [backup retention].',
            ],
          ],
        },
        {
          title: '7. Your rights',
          body: [
            'You have the right to:',
            [
              'know what data about you is processed, and get a copy of it;',
              'have wrong data corrected;',
              'have your data erased (except data the law requires us to keep);',
              'have processing restricted;',
              'object to processing based on legitimate interest;',
              'get the data you gave us in a machine-readable format and move it to another service.',
            ],
            `Send your request to ${O.email} from the email address your account was created with. We answer within one month. Requests are free. You can also delete your own posts, change your profile and delete your whole account and its data yourself in the service (My place > Delete account).`,
            'If you think your data is processed unlawfully, you can complain to the Finnish Data Protection Ombudsman, Tietosuojavaltuutettu (tietosuoja.fi), or to the data protection authority of your own country.',
          ],
        },
        {
          title: '8. Cookies and browser storage',
          body: [
            'D2M uses only what is strictly necessary for the service to work, which needs no consent:',
            [
              'd2m_session: a session cookie (httpOnly) that keeps you signed in. It is removed when you sign out or the session expires [session length].',
              'd2m.lang (the browser\'s localStorage): the language you chose.',
              'd2m.upload:… (localStorage), only while a video uploads: the file\'s name, size and the upload\'s identifier, so a broken upload can go on where it stopped. It is removed when the upload is finished or cancelled.',
            ],
            'No other cookies are used: no analytics, ads or third-party tracking. Stripe\'s payment page (stripe.com) may use its own cookies for payment security; Stripe\'s own policy explains them.',
          ],
        },
        {
          title: '9. Security',
          body: [
            'Connections to the service are encrypted (HTTPS). Passwords are stored only as hashes. Pictures and videos are in private storage and are shared only through short-lived addresses. Access to data is limited to those who need it to run the service.',
            'If a data breach puts you at high risk, we tell you without delay.',
          ],
        },
        {
          title: '10. Changes',
          body: ['If this policy changes significantly, we tell you in the service or by email.'],
        },
      ],
    },

    // ---------------- withdrawal and refunds ----------------
    refunds: {
      title: 'Withdrawal and refunds',
      lead: 'How the right of withdrawal, cancelling monthly payments and refunds work in D2M.',
      sections: [
        {
          title: '1. The right of withdrawal',
          body: [
            'As a consumer you have a 14-day right of withdrawal from purchases made online, under the Finnish Consumer Protection Act. The time is counted from the day of purchase.',
            'A single post (Exclusive) is digital content. The right of withdrawal ends when your access to the post begins, if at purchase you expressly asked for access at once and acknowledged that you then lose the right of withdrawal. D2M asks for this before the payment page with a required checkbox: “I ask for access to the content at once, and I understand that I lose my 14-day right of withdrawal.” Without it the purchase does not go on.',
            `Unlimited, Exclusive, extra storage and a monthly subscription to an author are digital services. Before the payment page you ask with a checkbox for the service to begin at once, and you acknowledge that if you withdraw within ${F.withdrawalDays} days, only the unused part is refunded. If you withdraw within ${F.withdrawalDays} days of the purchase, the contract ends at once and we refund the part of the latest payment that matches the time left in the billing period. [To check: whether monthly subscriptions fall under the withdrawal rule for digital content or for digital services.]`,
            'The time of your consent is recorded with the purchase in D2M\'s purchases log. The confirmation of the purchase comes as Stripe\'s email receipt, and the purchase shows, with the time of your consent, in the Purchases list in My place.',
          ],
        },
        {
          title: '2. How to withdraw',
          body: [
            `Withdraw in the service: My place > Purchases > Withdraw from a contract. It lists your monthly contracts bought in the last ${F.withdrawalDays} days that are still running. When you withdraw, the contract ends at once, the unused part is refunded through Stripe to the means of payment you used, and the withdrawal is recorded in the purchases log. The refund may take a few days to show on your account.`,
            'If you withdraw from Unlimited or Exclusive, you go back to Lite, and extra storage ends with it, as it belongs to the paid plans. If you bought extra storage in the last 14 days, withdraw from it first, so its unused part is refunded too.',
            `You can also tell us within ${F.withdrawalDays} days by email to ${O.email}. You may use the form below, but you do not have to: a clear statement that you withdraw from the purchase is enough. For a withdrawal by email we refund the money within 14 days of your notice, using the same means of payment you used, unless we agree otherwise.`,
            `Withdrawal form: To: ${O.name}, ${O.address}, ${O.email}. I hereby give notice that I withdraw from my contract for the following digital content or service: ______. Ordered on: ______. Name of consumer and the account\'s email address: ______. Date: ______.`,
          ],
        },
        {
          title: '3. Cancelling monthly payments',
          body: [
            'Monthly payments continue and are charged every month until you cancel them. There is no notice period.',
            [
              'Unlimited, Exclusive and extra storage: switch back to Lite in My place. The monthly payments end at once and no further charges are made.',
              'A monthly subscription to an author: press Cancel subscription on the author\'s profile or in search. It no longer renews, and you can read the author\'s paid posts until the end of the period paid for. The service shows until when it stays open.',
              'Deleting your account (My place > Delete account) ends all your monthly payments at once.',
            ],
            `If an author stops selling their monthly subscription or deletes their account, or their account is suspended, your subscription to them ends at once and no further charges are made. For a period already paid for you can ask for a credit at ${O.email}.`,
            'If your own account is suspended, your monthly payments do not renew: what you paid for runs to its end, and no further charges are made.',
            'A month already started is not refunded when you cancel, except during the withdrawal period (Withdraw from a contract) or if the service is defective.',
          ],
        },
        {
          title: '4. Refunds for posts bought',
          body: [
            'Once your access to a bought post has begun and you have accepted that the right of withdrawal ends, the price is not refunded just because you changed your mind.',
            'Before buying you see how long the post can be read: the date it stays up until, or that it is permanent. When the post\'s time is up, the price is not refunded.',
            `If the author deletes the post within ${F.refundDays} days of your purchase (also by deleting their account), we refund the whole price automatically through Stripe to the means of payment you used.`,
            'We also refund the price or put things right if:',
            [
              'the post does not open, or it is not what was promised;',
              'you paid for the same post twice, or there is another error in the payment.',
            ],
            `If a moderator removes a post because it breaks the content rules or the law, the price is not refunded automatically, and the automatic ${F.refundDays}-day refund does not apply to it. If you bought such a post and find it was not what was promised, you can ask for a credit at ${O.email}.`,
            'This does not limit your rights under consumer law when something is defective.',
          ],
        },
        {
          title: '5. Contact',
          body: [
            `Withdrawals, refunds and questions about payments: ${O.email}. Tell us your account's email address, what you bought and when, and it goes faster. We answer within [response time, e.g. a week].`,
          ],
        },
      ],
    },

    // ---------------- content rules ----------------
    rules: {
      title: 'Content rules',
      lead: 'D2M is a place for friends. These rules apply to all content: posts, letters, BoVNotes, conversations and profiles, private ones too.',
      sections: [
        {
          title: 'Allowed',
          body: [
            [
              'Intimate life: you may write about your own and private life, such as relationships, love, feelings, grief, mental health, health and the body, and about sexuality as a topic, matter-of-factly (experience, information), without explicit description.',
              'Ordinary tools: spelling and grammar checking, a phone camera\'s own processing, and ordinary cropping and colour adjustment.',
            ],
          ],
        },
        {
          title: 'Not allowed',
          body: [
            [
              'Sexual content: pornography, sexually explicit or suggestive pictures, videos and texts, and offering sexual services. This applies to the whole service, letters and friends-only posts included.',
              'Nudity, also non-sexual (art, breastfeeding, medical): [The owner\'s decision: not allowed for now. Change this to either "not allowed" or "allowed when it is not sexual".]',
              'Content that sexualises children, always. We remove it at once and report it to the police, as the law requires.',
              'AI-made content: text made wholly or mainly with generative AI, pictures and videos generated or altered with AI, AI voices, and always deepfakes of real people. This too applies to the whole service, letters and friends-only posts included.',
              'Illegal content, for example material that infringes someone\'s copyright, defamation, illegal threats, incitement to hatred against a group, sharing someone\'s private information or pictures without permission, and scams.',
              'Harassment: bullying, threats, stalking and humiliating others.',
              'Pretending to be someone else, and spam.',
            ],
          ],
        },
        {
          title: 'When you post publicly',
          body: ['A public post can be shown to everyone on the For You page, and anyone can read it and its conversation without an account, search engines too. That is why you confirm, when you post it, that it is your own work, not made with AI, and has no sexual content.'],
        },
        {
          title: 'How AI content is enforced',
          body: ['We have no automatic detection of AI content. The rule is enforced by the author\'s own confirmation and by reports: if you suspect a post was made with AI, report it with the reason AI-generated content. A moderator assesses the report.'],
        },
        {
          title: 'In groups',
          body: [
            'These rules apply in groups too, friend groups and interest groups alike. Everyone signed in can read an interest group’s posts, so when you write to one you confirm the same as when you post publicly. A group’s admin can remove posts from the group and ban users from an interest group, but D2M’s moderators decide on breaches of the rules: report a group’s post with its Report button.',
          ],
        },
        {
          title: 'How to report',
          body: [
            `Press the post's Report button and choose the reason: sexual content, AI-generated content or something else. Without an account you can report with the {notice form|/report-content} or by email to ${O.email}.`,
            'When three different users report the same post, it leaves the For You page at once until a moderator has handled it.',
          ],
        },
        {
          title: 'What happens then',
          body: [
            [
              'A person, a moderator, handles the report and sees the reported post whole. If the post does not break the rules, the reports are cleared and it comes back.',
              'If it does, the moderator removes it or restricts it so that only its author sees it, and the author gets a statement of reasons by email.',
              'For serious or repeated breaches the account is suspended for a set time or until further notice. An account is never deleted automatically.',
              'Whoever reported gets an email saying what was decided.',
              'Crimes are reported to the police.',
            ],
            `If a decision is about you and you disagree, you can complain within ${F.complaintMonths} months with the link in the statement of reasons. A person handles the complaint. If you reported, you can ask for a review by writing to us.`,
          ],
        },
      ],
    },

    // ---------------- contact ----------------
    contact: {
      title: 'Contact',
      lead: 'Who runs Dear to Me, and how to reach us.',
      sections: [
        {
          title: 'The operator',
          body: [
            [
              `Name: ${O.name}`,
              `Business ID (Y-tunnus): ${O.businessId}`,
              `VAT number: ${O.vatId}`,
              `Address: ${O.address}, Finland`,
              `Email: ${O.email}`,
              `Phone: ${O.phone}`,
            ],
            'Payments are handled by Stripe. On the payment page and your bank statement the payee may appear as [the name on the Stripe account].',
          ],
        },
        {
          title: 'What for',
          body: [
            `Everything, including privacy requests, withdrawals, refunds and reports of illegal content (also with the {notice form|/report-content}): ${O.email}. Authorities can use the same address (the Digital Services Act point of contact). We serve in Finnish and English.`,
          ],
        },
      ],
    },
  },
};
