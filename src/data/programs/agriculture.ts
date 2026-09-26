import type { Program } from './types.ts'
import { single } from './helpers.ts'

// Sources (University Catalogue 2026-27, checked 2026-09-26):
// - programs.usask.ca/agriculture-and-bioresources/agribusiness/bsc-agribusiness.php
// - programs.usask.ca/agriculture-and-bioresources/animal-science/bsa-animal-science.php
// - programs.usask.ca/agriculture-and-bioresources/food-and-bioproduct-sciences/bsa-food-and-bioproduct-sciences.php
//
// Left out: the Humanities/Social Science/Fine Arts choice and open electives (open-ended).
// Restricted-elective lists are kept with `need` = credit units ÷ 3; each page also allows
// "courses approved by an advisor", which can't be enumerated. A course that a list shares with a
// required slot is dropped from the list so it can't count twice.

/** English Language Writing Requirement — the same list on all three pages. */
// Listed on the program page but no longer in the catalogue (catalogue.usask.ca, 2026-09-26), so
// left out of the option lists: AREC395, AREC400, AREC433, AREC434, AREC435, COMM404, FABS360, FABS457, PLSC423, POLS226, MATH121.
const englishWriting = {
  courses: [
    'ANTH302', 'ANTH306', 'ANTH310', 'CPSJ203', 'ENG111', 'ENG112', 'ENG113', 'ENG114', 'ENG120',
    'HIST115', 'HIST125', 'HIST135', 'HIST145', 'HIST155', 'HIST165', 'HIST175', 'HIST185', 'HIST193', 'HIST194',
    'PHIL120', 'PHIL121', 'PHIL133', 'PHIL208', 'PHIL233',
    'POLS245', 'POLS323', 'POLS328', 'POLS333', 'POLS336', 'POLS422', 'POLS461', 'PSY323', 'PSY355', 'RLST280', 'RLST362',
  ],
  need: 1,
}

export const agriculture: Program = {
  id: 'agriculture',
  name: 'Agriculture and Bioresources',
  courseTitles: {},
  specializationsAreMajors: true,
  coursesPerTerm: 5,
  specializations: [
    {
      id: 'agribusiness',
      name: 'Agribusiness',
      requirements: [
        // Year 1
        ...['AGRC111', 'AGRC112', 'AGRC113', 'COMM101', 'ECON111', 'ECON114'].map(single),
        { courses: ['MATH104', 'MATH110', 'MATH125'], need: 1 },
        englishWriting,
        // "GEOG 120.3 or GEOG 125.3" appears in both Year 1 and Year 2, but GEOG 125 is no longer in
        // the catalogue, so only one GEOG course can actually be taken. Counted once.
        single('GEOG120'),
        // Year 2
        ...['AREC222', 'AREC261', 'AREC262', 'AREC272'].map(single),
        { courses: ['COMM201', 'COMM225'], need: 1 },
        single('COMM203'),
        single('COMM204'),
        { courses: ['RCM200', 'AGRC110'], need: 1 },
        // Years 3-4
        ...['AREC322', 'AREC342', 'AREC343', 'AREC347'].map(single),
        { courses: ['AREC495', 'AREC428'], need: 1 },
        {
          // 24 cu of restricted electives. AREC 428/495 dropped (they're the capstone slot above);
          // ECON 412 dropped (not in the catalogue).
          courses: [
            'AGRC445', 'AREC220', 'AREC230', 'AREC238', 'AREC251', 'AREC254', 'AREC315', 'AREC344', 'AREC346',
            'AREC348', 'AREC354', 'AREC356', 'AREC420', 'AREC422', 'AREC423', 'AREC430',
            'AREC432', 'AREC440', 'AREC445', 'AREC451', 'AREC459',
            'COMM105', 'COMM205', 'COMM210', 'COMM211', 'COMM229', 'COMM247', 'COMM304', 'COMM306', 'COMM340',
            'COMM342', 'COMM345', 'COMM354', 'COMM357', 'COMM363', 'COMM368', 'COMM456', 'COMM495',
            'ECON211', 'ECON304', 'ECON350', 'ECON354', 'ECON373', 'PLSC214', 'POLS305', 'POLS328',
            'RCM400', 'RCM401', 'RCM402', 'RCM404', 'RCM406', 'RCM407', 'RCM408', 'RCM409', 'RCM410', 'RCM495', 'RRM312',
          ],
          need: 8,
        },
      ],
    },
    {
      id: 'animal-science',
      name: 'Animal Science',
      requirements: [
        // Year 1
        ...['AGRC110', 'AGRC111', 'AGRC112', 'AGRC113'].map(single),
        { courses: ['AREC220', 'INDG107'], need: 1 },
        ...['BIOL120', 'BIOL224', 'CHEM112', 'CHEM250'].map(single),
        // Year 2
        ...['ANSC212', 'ANSC313', 'BMSC200', 'BMSC230'].map(single),
        { courses: ['FABS212', 'BMSC210'], need: 1 },
        { courses: ['MATH104', 'MATH110', 'MATH125'], need: 1 },
        single('PLSC214'),
        englishWriting,
        // Years 3-4
        ...['ANSC315', 'ANSC316', 'ANSC410', 'ANSC430', 'ANSC440', 'ANSC460', 'ANSC485', 'VBMS324', 'VBMS325'].map(single),
        { courses: ['ANSC492', 'ANSC494'], need: 1 },
        {
          // 6 cu in Year 2 + 12 cu in Years 3-4 of restricted electives, one shared list. ANSC 494
          // dropped (it's the capstone slot above).
          courses: [
            'ANBI298', 'ANBI320', 'ANBI360', 'ANBI375', 'ANBI398', 'ANBI411', 'ANBI420', 'ANBI470', 'ANBI471',
            'ANBI475', 'ANBI498', 'ANSC298', 'ANSC301', 'ANSC355', 'ANSC398', 'ANSC498', 'AREC222', 'AREC343',
            'BINF151', 'BIOL222', 'BIOL226', 'BIOL228', 'BIOL316', 'BIOL430', 'BIOL451', 'BIOL455', 'BIOL458',
            'BIOL472', 'BLE205', 'BLE303', 'BMIS308', 'BMIS340', 'BMSC220', 'BMSC240', 'COMM101', 'COMM105',
            'COMM201', 'COMM204', 'COMM304', 'FABS110', 'FABS325', 'PHYS115', 'PLSC213',
            'PLSC405', 'PLSC418', 'PLSC420', 'PLSC422', 'RCM400', 'RCM401', 'RCM402', 'RCM404',
            'RCM406', 'RCM407', 'RCM408', 'RCM409', 'RCM410', 'RCM495', 'RRM312', 'TOX300', 'TOX402',
            'VBMS314', 'VLAC411', 'VTPA412',
          ],
          need: 6,
        },
      ],
    },
    {
      id: 'food-and-bioproduct-sciences',
      name: 'Food and Bioproduct Sciences',
      requirements: [
        // Year 1
        ...['AGRC110', 'AGRC111', 'AGRC112', 'AGRC113', 'BIOL120', 'BIOL121', 'CHEM112', 'CHEM250', 'ECON111', 'FABS110'].map(single),
        // Year 2
        { courses: ['AREC220', 'INDG107'], need: 1 },
        ...['BMSC200', 'BMSC230', 'FABS211'].map(single),
        { courses: ['FABS212', 'BMSC210'], need: 1 },
        { courses: ['MATH104', 'MATH110', 'MATH125'], need: 1 },
        single('NUTR120'),
        { courses: ['PLSC214', 'STAT245'], need: 1 },
        englishWriting,
        // Years 3-4
        { courses: ['COMM204', 'AREC230'], need: 1 },
        ...['FABS315', 'FABS317', 'FABS325', 'FABS334', 'FABS345', 'FABS375', 'FABS452', 'FABS456'].map(single),
        { courses: ['FABS492', 'FABS494'], need: 1 },
        {
          // 18 cu of restricted electives (or courses toward a minor). FABS 494 dropped (capstone slot).
          courses: [
            'BMSC240', 'BMSC320', 'CHEM115', 'CHEM221', 'CHEM231', 'CHEM242', 'CHEM255', 'FABS222', 'FABS298',
            'FABS362', 'FABS371', 'FABS398', 'FABS401', 'FABS411', 'FABS460', 'FABS466', 'FABS474',
            'FABS493', 'FABS498', 'NUTR201', 'NUTR322', 'PLSC420',
          ],
          need: 6,
        },
      ],
    },
  ],
}
