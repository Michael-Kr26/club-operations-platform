// Page-preview data only. These records do not grant tenant access.
export type OrganizationPreview = {
  id: string;
  slug: string;
  name: string;
  locations: { name: string; slug: string }[];
};

export const organizationPreviews: OrganizationPreview[] = [
  {
    id: 'preview-sport-society',
    slug: 'sport-society',
    name: 'Sport Society',
    locations: [
      { name: 'Achterveld', slug: 'achterveld' },
      { name: 'Barneveld', slug: 'barneveld' },
      { name: 'Voorthuizen', slug: 'voorthuizen' },
      { name: 'Harskamp', slug: 'harskamp' },
      { name: 'Wekerom', slug: 'wekerom' },
    ],
  },
];
