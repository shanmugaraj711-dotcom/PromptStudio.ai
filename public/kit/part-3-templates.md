# Part 3 — Copy-Paste Templates

## How to use these

Replace every word in [square brackets] with your own details. Then read the whole
thing once out loud — if anything sounds wrong or untrue, fix it before you publish.
Nothing here should say anything your business does not actually do.

---

## Template A — FAQ page text

Copy this onto a page of your website called "Frequently Asked Questions".

> # Frequently Asked Questions — [BUSINESS NAME]
>
> **[BUSINESS NAME] is a [SERVICE TYPE, e.g. dental clinic / wedding photography
> studio / skin clinic] in [AREA, CITY].**
>
> **What services do you offer?**
> We offer [SERVICE 1], [SERVICE 2], and [SERVICE 3] in [AREA, CITY].
>
> **Where are you located?**
> You can find us at [FULL ADDRESS]. We serve customers from [AREA 1],
> [AREA 2], and nearby areas.
>
> **What are your opening hours?**
> We are open [DAYS] from [OPENING TIME] to [CLOSING TIME]. [We are closed on
> SUNDAYS / We are open all 7 days.]
>
> **How much does [MOST COMMON SERVICE] cost?**
> [SERVICE] starts at ₹[PRICE]. The final price depends on [ONE HONEST FACTOR,
> e.g. the number of sittings / the size of the event]. We tell you the full price
> before we start — no hidden charges.
>
> **How do I book an appointment?**
> Call us at [PHONE NUMBER] or message us on WhatsApp at [PHONE NUMBER]. You can
> also walk in during opening hours.
>
> **How long does [MOST COMMON SERVICE] take?**
> [SERVICE] usually takes [TIME, e.g. 45 minutes / one full day]. We will tell
> you the exact time when you book.
>
> **Why should I choose [BUSINESS NAME]?**
> [ONE TRUE SENTENCE, e.g. We have served Velachery for over 10 years. / Our
> team has photographed more than 200 weddings in Chennai.] Do not write anything
> here you cannot prove.

**Tips:**
- Add more questions only if customers really ask them. Five honest questions
  beat twenty invented ones.
- Use the exact words customers say. If they say "root canal", write "root
  canal" — not the medical textbook word.

---

## Template B — FAQ markup for your website

This is a small block of code that helps search engines and AI assistants read
your FAQ page. Paste it into your page's code (in the `<head>` section, or ask
your website person to add it). **Every question and answer here must match
Template A word for word** — if they disagree, search engines ignore both.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What services does [BUSINESS NAME] offer?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We offer [SERVICE 1], [SERVICE 2], and [SERVICE 3] in [AREA, CITY]."
      }
    },
    {
      "@type": "Question",
      "name": "Where is [BUSINESS NAME] located?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "You can find us at [FULL ADDRESS]. We serve customers from [AREA 1], [AREA 2], and nearby areas."
      }
    },
    {
      "@type": "Question",
      "name": "What are the opening hours of [BUSINESS NAME]?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We are open [DAYS] from [OPENING TIME] to [CLOSING TIME]."
      }
    },
    {
      "@type": "Question",
      "name": "How do I book an appointment at [BUSINESS NAME]?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Call us at [PHONE NUMBER] or message us on WhatsApp at [PHONE NUMBER]."
      }
    }
  ]
}
</script>
```

**After pasting:**
1. Check the page still loads normally in your browser.
2. Ask your website person to test it with Google's free Rich Results Test
   (search "Google Rich Results Test" — it is free and needs no account).
3. If the test shows errors, fix the brackets you missed — a common mistake is
   leaving a `[` or `]` behind.

**One warning:** this markup does not guarantee anything. It only makes your
answers easier to read. Businesses that are named by AI assistants usually have
many clear sources saying the same thing — this markup is one of them, not a
magic switch.
