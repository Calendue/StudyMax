import type { Program } from './types.js'
import { single } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/astronomy/index.php (15 credit units).
// The page's primary phrasing is open-ended ("choose 9cu from ASTR at any level"). Using the
// page's own documented concrete alternative path instead ("Path 2"), which is fully enumerated.
export const astronomyCertificate: Program = {
  id: 'astronomy-certificate',
  name: 'Certificate in Astronomy',
  kind: 'certificate',
  courseTitles,
  specializations: [
    {
      id: 'astronomy-certificate',
      name: 'Certificate in Astronomy',
      requirements: [
        single('ASTR213'),
        single('ASTR214'),
        {
          courses: [
            'ASTR102', 'ASTR104', 'ASTR113', 'ASTR298', 'ASTR299', 'ASTR310',
            'ASTR312', 'ASTR398', 'ASTR399', 'ASTR411', 'ASTR498', 'ASTR499',
          ],
          need: 3,
        },
      ],
    },
  ],
}
