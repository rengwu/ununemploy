import {
  getProfile,
  getTemplate,
  listCvVersions,
  saveCv,
  transaction,
} from "../core/db/index.ts";
import { fromProfile } from "../core/cv/render.ts";
// Upgrade only the untouched development seed; never replace a user-edited template.
const versions = listCvVersions();
if (
  versions.length === 1 &&
  versions[0].kind === "master" &&
  versions[0].template.css.includes("10pt/1.45") &&
  getProfile().revision === versions[0].profileRevision
) {
  transaction(() =>
    saveCv({
      jobId: null,
      kind: "master",
      document: fromProfile(getProfile()),
      template: getTemplate(),
      profileRevision: getProfile().revision,
      reviewNotes: [],
      evidence: null,
      parentId: versions[0].id,
    }),
  );
  console.log("Updated the initial master template as a new version.");
}
