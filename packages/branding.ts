export const identity = {
  title: "PAM Research Studio",
  version: "0.11.0",
  researcher: "Aisy Fawwaz",
  project: "MRes Project",
  discipline: "Bioengineering",
  institution: "Imperial College London",
};
export const libraryCredits = [
  {
    name: "jbubble",
    version: "0.2.0",
    role: "Radial microbubble dynamics",
    authors:
      "Callum Rhys Tilbury, Shima Mohammed, Anthea MacIntosh-LaRocque, Rui Xu, Ben Moseley and James J. Choi",
    reference: "https://github.com/imperial-nsb/jbubble/blob/main/CITATION.cff",
    license: "MIT",
  },
  {
    name: "j-Wave",
    version: "0.2.1",
    role: "Acoustic wave propagation",
    authors:
      "Antonio Stanziola, Simon R. Arridge, Ben T. Cox and Bradley E. Treeby",
    reference: "doi:10.1016/j.softx.2023.101338",
    license: "LGPL-3.0-only",
  },
  {
    name: "SciPy signal",
    version: "1.16.3",
    role: "Receive digital signal processing",
    authors: "Pauli Virtanen and the SciPy contributors",
    reference: "doi:10.1038/s41592-019-0686-2",
    license: "BSD-3-Clause",
  },
  {
    name: "ReportLab",
    version: "5.1.0",
    role: "Research PDF reports",
    authors: "ReportLab Inc. and contributors",
    reference: "https://pypi.org/project/reportlab/5.1.0/",
    license: "BSD-3-Clause",
  },
  {
    name: "Mediabunny",
    version: "1.65.2",
    role: "Timestamped WebM video export",
    authors: "Vanilagy (David P.) and contributors",
    reference: "https://github.com/Vanilagy/mediabunny",
    license: "MPL-2.0; unmodified upstream source",
  },
  {
    name: "pydicom",
    version: "3.0.2",
    role: "DICOM metadata, HU and pixel data",
    authors: "Darcy Mason and pydicom contributors",
    reference: "https://github.com/pydicom/pydicom",
    license: "MIT + BSD dictionary notices",
  },
  {
    name: "GDCM / Python-GDCM",
    version: "3.2.6",
    role: "Compressed DICOM decoding",
    authors:
      "Mathieu Malaterre, CREATIS and GDCM contributors; Python packaging by Thiago Franco de Moraes",
    reference: "https://github.com/tfmoraes/python-gdcm",
    license: "BSD core / Apache-2.0 packaging",
  },
];
export const methodCredits = [
  {
    name: "Lipid shell buckling and rupture",
    authors:
      "Philippe Marmottant, Sander van der Meer, Marcia Emmer, Michel Versluis, Nico de Jong, Sascha Hilgenfeldt and Detlef Lohse; smooth-law implementation by jbubble contributors",
    reference: "doi:10.1121/1.2109427",
  },
  {
    name: "gCNR benchmark",
    authors:
      "Alfonso Rodriguez-Molares, Ole Marius Hoel Rindal, Jan D’Hooge, Svein-Erik Måsøy, Andreas Austeng, Muyinatu A. Lediju Bell and Hans Torp",
    reference: "doi:10.1109/TUFFC.2019.2956855",
  },
  {
    name: "Passive mapping / TEA",
    authors: "Miklós Gyöngy and Constantin-C. Coussios",
    reference: "doi:10.1121/1.3467491",
  },
  {
    name: "Coherence factor",
    authors: "René Mallart and Mathias Fink",
    reference: "doi:10.1121/1.410562",
  },
  {
    name: "Robust Capon",
    authors: "Jian Li, Petre Stoica and Zhisong Wang",
    reference: "doi:10.1109/TSP.2003.812831",
  },
  {
    name: "Short-pulse mapping / ATP",
    authors:
      "Harry J. Davies, Sophie V. Morse, Matthew J. Copping, Krit Sujarittam, Victor D. Bourgin, Meng-Xing Tang and James J. Choi",
    reference: "doi:10.1109/TUFFC.2020.3026165",
  },
];
export const anatomyCredit = {
  title: "Bundled public head CTA reference",
  authors:
    "Evgenia Blagosklonova, Daria Dolotova, Natalia Polunina, Elena Grigorieva, Denis Pakhomov, Vladimir Krylov and Andrey Gavrilov",
  reference: "doi:10.5281/zenodo.15697196",
  license: "CC BY 4.0",
  modifications:
    "One axial slice selected; pixels and HU geometry retained, metadata rebuilt with public-reference identifiers. Acoustic calibration is experimental and separate from the source dataset.",
};
