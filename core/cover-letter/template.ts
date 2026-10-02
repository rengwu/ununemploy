import type { Template } from "../types.ts";

export const defaultCoverLetterTemplate: Template = {
  html: `<header>
  <h1>{{name}}</h1>
  <div class="contact">{{location}}{{#each contacts}} · {{#if url}}<a href="{{url}}">{{label}}</a>{{else}}{{label}}{{/if}}{{/each}}</div>
</header>
<div class="recipient">{{company}}</div>
<p class="subject">{{role}}</p>
<p>{{salutation}}</p>
<main>{{#each paragraphs}}<p>{{this}}</p>{{/each}}</main>
<footer><p>{{closing}}<br>{{name}}</p></footer>`,
  css: `@page { size: A4; margin: 20mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 11pt/1.5 Arial, Helvetica, sans-serif; color: #17212b; background: white; }
header { margin-bottom: 22pt; }
h1 { font-size: 22pt; line-height: 1.2; font-weight: 600; margin: 0 0 6pt; }
.contact { font-size: 9pt; color: #46515e; overflow-wrap: anywhere; }
a { color: inherit; text-decoration: none; }
.recipient { margin-bottom: 4pt; }
.subject { font-weight: 600; margin: 0 0 18pt; }
p { margin: 0 0 12pt; orphans: 3; widows: 3; }
footer { margin-top: 18pt; break-inside: avoid; }
@media screen { body { padding: 20mm; max-width: 210mm; margin: 0 auto; } }`,
};
