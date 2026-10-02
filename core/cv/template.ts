import type { Template } from "../types.ts";

export const defaultTemplate: Template = {
  html: `<header>
  <h1>{{name}}</h1>
  <div class="headline">{{headline}}</div>
  <div class="contact">{{location}}{{#each contacts}} · {{#if url}}<a href="{{url}}">{{label}}</a>{{else}}{{label}}{{/if}}{{/each}}</div>
</header>
<p class="summary">{{summary}}</p>
<section>
  <h2>Experience</h2>
  {{#each experience}}
  <article>
    <div class="row"><h3>{{employer}}</h3><span>{{dates}}</span></div>
    <div class="role">{{title}}{{#if location}} · {{location}}{{/if}}</div>
    <ul>{{#each bullets}}<li>{{this}}</li>{{/each}}</ul>
  </article>
  {{/each}}
</section>
{{#if projects.length}}<section>
  <h2>Projects</h2>
  {{#each projects}}<article>
    <h3><a href="{{url}}">{{name}}</a></h3>
    <p>{{summary}}</p>
    {{#if bullets.length}}<ul>{{#each bullets}}<li>{{this}}</li>{{/each}}</ul>{{/if}}
    {{#if attribution}}<p class="attribution">{{attribution}}</p>{{/if}}
  </article>{{/each}}
</section>{{/if}}
{{#if skills.length}}<section><h2>Skills</h2><p>{{#each skills}}{{this}}{{#unless @last}} · {{/unless}}{{/each}}</p></section>{{/if}}
{{#if education.length}}<section><h2>Education</h2>{{#each education}}<article><div class="row"><h3>{{institution}}</h3><span>{{dates}}</span></div><p>{{qualification}}</p></article>{{/each}}</section>{{/if}}
{{#if awards.length}}<section><h2>Awards</h2><ul>{{#each awards}}<li>{{name}} — {{result}}, {{year}}</li>{{/each}}</ul></section>{{/if}}`,
  css: `@page { size: A4; margin: 16mm 17mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 10pt/1.4 Arial, Helvetica, sans-serif; color: #17212b; background: white; }
header { margin-bottom: 14pt; }
h1 { font-size: 24pt; line-height: 1.15; font-weight: 600; margin: 0 0 4pt; }
.headline { font-size: 12pt; margin-bottom: 5pt; }
.contact { font-size: 9pt; color: #46515e; }
a { color: inherit; text-decoration: none; }
.summary { margin: 0 0 13pt; }
section { margin: 0 0 12pt; }
h2 { font-size: 11pt; font-weight: 600; margin: 0 0 7pt; padding-bottom: 3pt; border-bottom: 1px solid #9ca5ae; break-after: avoid; }
h3 { font-size: 10.5pt; font-weight: 600; margin: 0; }
article { margin: 0 0 8pt; break-inside: avoid; }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 12pt; break-after: avoid; }
.row > span { white-space: nowrap; font-size: 9pt; }
.role { color: #46515e; margin: 2pt 0 3pt; break-after: avoid; }
p { margin: 3pt 0; }
ul { padding-left: 14pt; margin: 3pt 0 0; }
li { padding-left: 1pt; margin: 2pt 0; break-inside: avoid; }
.attribution { font-size: 9pt; color: #46515e; }
@media screen { body { padding: 16mm 17mm; max-width: 210mm; margin: 0 auto; } }`,
};
