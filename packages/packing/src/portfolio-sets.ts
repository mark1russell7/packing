// This file is generated. Do not edit it. `bench/choose-sets.ts` writes it from the records of one run of `bench.yml`:
// the corpus `pack-screen-v1`, the run 40652567756 and the commit f6a489b.
// The sets of each cell come from all the 1305 inputs. A cell with fewer than 12 inputs is thin.
// The default member count of a cell is the largest prefix with a median summed time of 50 ms or less on these CI records.

import type { PortfolioSets } from "./portfolio-cell.ts";

/** The table of the per-cell portfolio: the sets of 1, 2 and 3 members of each cell, with their training scores. The run 40652567756 gives it. */
export const PORTFOLIO_SETS: PortfolioSets = {
  "source": {
    "corpus": "pack-screen-v1",
    "run": "40652567756",
    "commit": "f6a489b",
    "inputs": 1305,
    "frameMs": 50
  },
  "entries": {
    "rows": {
      "id": "rows",
      "strategy": "rows"
    },
    "skyline": {
      "id": "skyline",
      "strategy": "skyline"
    },
    "shelf": {
      "id": "shelf",
      "strategy": "shelf"
    },
    "shelf-next": {
      "id": "shelf-next",
      "strategy": "shelf",
      "options": {
        "fit": "next",
        "sortOrder": "height-desc"
      }
    },
    "shelf-first": {
      "id": "shelf-first",
      "strategy": "shelf",
      "options": {
        "fit": "first",
        "sortOrder": "height-desc"
      }
    },
    "shelf-best": {
      "id": "shelf-best",
      "strategy": "shelf",
      "options": {
        "fit": "best",
        "sortOrder": "height-desc"
      }
    },
    "maxrects-bssf": {
      "id": "maxrects-bssf",
      "strategy": "maxrects",
      "options": {
        "rule": "bssf"
      }
    },
    "maxrects-blsf": {
      "id": "maxrects-blsf",
      "strategy": "maxrects",
      "options": {
        "rule": "blsf"
      }
    },
    "maxrects-baf": {
      "id": "maxrects-baf",
      "strategy": "maxrects",
      "options": {
        "rule": "baf"
      }
    },
    "maxrects-bl": {
      "id": "maxrects-bl",
      "strategy": "maxrects",
      "options": {
        "rule": "bl"
      }
    },
    "maxrects-cp": {
      "id": "maxrects-cp",
      "strategy": "maxrects",
      "options": {
        "rule": "cp"
      }
    }
  },
  "all": {
    "inputs": 1305,
    "thin": false,
    "sets": {
      "1": [
        "maxrects-bl"
      ],
      "2": [
        "maxrects-bl",
        "shelf-best"
      ],
      "3": [
        "maxrects-bl",
        "shelf-best",
        "maxrects-cp"
      ]
    },
    "train": {
      "1": {
        "inputs": 1305,
        "hardRegret": 0,
        "excessAreaRegret": 0.001,
        "fillRegret": 0.02,
        "wins": 838,
        "winShare": 0.642,
        "msMean": 4.92
      },
      "2": {
        "inputs": 1305,
        "hardRegret": 0,
        "excessAreaRegret": 0.001,
        "fillRegret": 0.011,
        "wins": 1033,
        "winShare": 0.792,
        "msMean": 9.582
      },
      "3": {
        "inputs": 1305,
        "hardRegret": 0,
        "excessAreaRegret": 0,
        "fillRegret": 0.006,
        "wins": 1126,
        "winShare": 0.863,
        "msMean": 22.228
      }
    },
    "prefixMedianMs": {
      "1": 1.015,
      "2": 2.004,
      "3": 3.074
    },
    "defaultMembers": 3
  },
  "shapes": {
    "circle": {
      "inputs": 210,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "maxrects-cp"
        ],
        "3": [
          "maxrects-bl",
          "maxrects-cp",
          "skyline"
        ]
      },
      "train": {
        "1": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0.002,
          "fillRegret": 0.015,
          "wins": 140,
          "winShare": 0.667,
          "msMean": 10.026
        },
        "2": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.006,
          "wins": 162,
          "winShare": 0.771,
          "msMean": 35.829
        },
        "3": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.003,
          "wins": 184,
          "winShare": 0.876,
          "msMean": 46.593
        }
      },
      "prefixMedianMs": {
        "1": 3.441,
        "2": 7.24,
        "3": 10.252
      },
      "defaultMembers": 3
    },
    "convex": {
      "inputs": 210,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "shelf-best"
        ],
        "3": [
          "maxrects-bl",
          "shelf-best",
          "maxrects-cp"
        ]
      },
      "train": {
        "1": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0.002,
          "fillRegret": 0.015,
          "wins": 134,
          "winShare": 0.638,
          "msMean": 6.123
        },
        "2": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0.002,
          "fillRegret": 0.004,
          "wins": 188,
          "winShare": 0.895,
          "msMean": 11.606
        },
        "3": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0.001,
          "fillRegret": 0.002,
          "wins": 197,
          "winShare": 0.938,
          "msMean": 26.072
        }
      },
      "prefixMedianMs": {
        "1": 2.133,
        "2": 3.31,
        "3": 7.783
      },
      "defaultMembers": 3
    },
    "ellipse": {
      "inputs": 210,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "maxrects-cp"
        ],
        "3": [
          "maxrects-bl",
          "maxrects-cp",
          "skyline"
        ]
      },
      "train": {
        "1": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.024,
          "wins": 138,
          "winShare": 0.657,
          "msMean": 9.772
        },
        "2": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.008,
          "wins": 162,
          "winShare": 0.771,
          "msMean": 34.101
        },
        "3": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.005,
          "wins": 184,
          "winShare": 0.876,
          "msMean": 49.128
        }
      },
      "prefixMedianMs": {
        "1": 3.553,
        "2": 7.079,
        "3": 11.095
      },
      "defaultMembers": 3
    },
    "holes": {
      "inputs": 210,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "shelf-first"
        ],
        "3": [
          "maxrects-bl",
          "shelf-first",
          "maxrects-cp"
        ]
      },
      "train": {
        "1": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0.001,
          "fillRegret": 0.016,
          "wins": 131,
          "winShare": 0.624,
          "msMean": 2.009
        },
        "2": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0.001,
          "fillRegret": 0.011,
          "wins": 163,
          "winShare": 0.776,
          "msMean": 8.29
        },
        "3": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.005,
          "wins": 183,
          "winShare": 0.871,
          "msMean": 13.146
        }
      },
      "prefixMedianMs": {
        "1": 0.755,
        "2": 1.626,
        "3": 2.455
      },
      "defaultMembers": 3
    },
    "polygon": {
      "inputs": 210,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "shelf-best"
        ],
        "3": [
          "maxrects-bl",
          "shelf-best",
          "maxrects-blsf"
        ]
      },
      "train": {
        "1": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.03,
          "wins": 130,
          "winShare": 0.619,
          "msMean": 1.663
        },
        "2": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.012,
          "wins": 180,
          "winShare": 0.857,
          "msMean": 7.39
        },
        "3": {
          "inputs": 210,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.004,
          "wins": 193,
          "winShare": 0.919,
          "msMean": 8.701
        }
      },
      "prefixMedianMs": {
        "1": 0.477,
        "2": 1.176,
        "3": 1.636
      },
      "defaultMembers": 3
    },
    "rect": {
      "inputs": 255,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "shelf-best"
        ],
        "3": [
          "maxrects-bl",
          "shelf-best",
          "maxrects-blsf"
        ]
      },
      "train": {
        "1": {
          "inputs": 255,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.019,
          "wins": 165,
          "winShare": 0.647,
          "msMean": 0.808
        },
        "2": {
          "inputs": 255,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.007,
          "wins": 212,
          "winShare": 0.831,
          "msMean": 2.807
        },
        "3": {
          "inputs": 255,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.003,
          "wins": 225,
          "winShare": 0.882,
          "msMean": 3.514
        }
      },
      "prefixMedianMs": {
        "1": 0.094,
        "2": 0.426,
        "3": 0.582
      },
      "defaultMembers": 3
    }
  },
  "cells": {
    "circle/10/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-cp"
        ],
        "2": [
          "maxrects-cp",
          "maxrects-bl"
        ],
        "3": [
          "maxrects-cp",
          "maxrects-bl",
          "skyline"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0.004,
          "fillRegret": 0.073,
          "wins": 10,
          "winShare": 0.286,
          "msMean": 0.886
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.014,
          "wins": 20,
          "winShare": 0.571,
          "msMean": 1.82
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.01,
          "wins": 28,
          "winShare": 0.8,
          "msMean": 2.277
        }
      },
      "prefixMedianMs": {
        "1": 0.938,
        "2": 1.86,
        "3": 2.105
      },
      "defaultMembers": 3
    },
    "circle/10/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "skyline"
        ],
        "3": [
          "maxrects-bl",
          "skyline",
          "maxrects-cp"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.025,
          "wins": 14,
          "winShare": 0.4,
          "msMean": 1.028
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.009,
          "wins": 28,
          "winShare": 0.8,
          "msMean": 1.317
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.007,
          "wins": 32,
          "winShare": 0.914,
          "msMean": 2.411
        }
      },
      "prefixMedianMs": {
        "1": 0.971,
        "2": 1.237,
        "3": 2.388
      },
      "defaultMembers": 3
    },
    "circle/100/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "maxrects-bssf"
        ],
        "3": [
          "maxrects-bl",
          "maxrects-bssf",
          "maxrects-cp"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0.001,
          "fillRegret": 0.004,
          "wins": 26,
          "winShare": 0.743,
          "msMean": 3.076
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.004,
          "wins": 30,
          "winShare": 0.857,
          "msMean": 5.932
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.001,
          "wins": 33,
          "winShare": 0.943,
          "msMean": 8.775
        }
      },
      "prefixMedianMs": {
        "1": 2.837,
        "2": 5.774,
        "3": 8.149
      },
      "defaultMembers": 3
    },
    "circle/100/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "maxrects-cp"
        ],
        "3": [
          "maxrects-bl",
          "maxrects-cp"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.005,
          "wins": 30,
          "winShare": 0.857,
          "msMean": 4.611
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 14.686
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 14.686
        }
      },
      "prefixMedianMs": {
        "1": 4.648,
        "2": 14.826,
        "3": 14.826
      },
      "defaultMembers": 2
    },
    "circle/1k/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bssf"
        ],
        "2": [
          "maxrects-bssf",
          "maxrects-blsf"
        ],
        "3": [
          "maxrects-bssf",
          "maxrects-blsf",
          "maxrects-bl"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.002,
          "wins": 33,
          "winShare": 0.943,
          "msMean": 6.063
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.002,
          "wins": 34,
          "winShare": 0.971,
          "msMean": 11.397
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 17.653
        }
      },
      "prefixMedianMs": {
        "1": 5.498,
        "2": 9.771,
        "3": 14.704
      },
      "defaultMembers": 3
    },
    "circle/1k/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "shelf-best"
        ],
        "3": [
          "maxrects-bl",
          "shelf-best"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.001,
          "wins": 31,
          "winShare": 0.886,
          "msMean": 44.25
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 56.133
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 56.133
        }
      },
      "prefixMedianMs": {
        "1": 46.745,
        "2": 58.961,
        "3": 58.961
      },
      "defaultMembers": 1
    },
    "convex/10/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-cp"
        ],
        "2": [
          "maxrects-cp",
          "maxrects-baf"
        ],
        "3": [
          "maxrects-cp",
          "maxrects-baf",
          "maxrects-bl"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0.007,
          "fillRegret": 0.208,
          "wins": 5,
          "winShare": 0.143,
          "msMean": 0.577
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0.001,
          "fillRegret": 0.143,
          "wins": 7,
          "winShare": 0.2,
          "msMean": 1.46
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.016,
          "wins": 26,
          "winShare": 0.743,
          "msMean": 2.184
        }
      },
      "prefixMedianMs": {
        "1": 0.513,
        "2": 1.303,
        "3": 1.931
      },
      "defaultMembers": 3
    },
    "convex/10/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "maxrects-cp"
        ],
        "3": [
          "maxrects-bl",
          "maxrects-cp",
          "maxrects-bssf"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.012,
          "wins": 26,
          "winShare": 0.743,
          "msMean": 0.786
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.005,
          "wins": 30,
          "winShare": 0.857,
          "msMean": 1.482
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.002,
          "wins": 32,
          "winShare": 0.914,
          "msMean": 2.348
        }
      },
      "prefixMedianMs": {
        "1": 0.71,
        "2": 1.316,
        "3": 2.22
      },
      "defaultMembers": 3
    },
    "convex/100/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "maxrects-cp"
        ],
        "3": [
          "maxrects-bl",
          "maxrects-cp",
          "maxrects-bssf"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.001,
          "wins": 32,
          "winShare": 0.914,
          "msMean": 2.416
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 34,
          "winShare": 0.971,
          "msMean": 5.037
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 7.013
        }
      },
      "prefixMedianMs": {
        "1": 2.083,
        "2": 4.342,
        "3": 5.664
      },
      "defaultMembers": 3
    },
    "convex/100/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "shelf"
        ],
        "3": [
          "maxrects-bl",
          "shelf",
          "shelf-first"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.007,
          "wins": 21,
          "winShare": 0.6,
          "msMean": 3.347
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.001,
          "wins": 33,
          "winShare": 0.943,
          "msMean": 3.533
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.001,
          "wins": 34,
          "winShare": 0.971,
          "msMean": 4.004
        }
      },
      "prefixMedianMs": {
        "1": 3.337,
        "2": 3.513,
        "3": 3.956
      },
      "defaultMembers": 3
    },
    "convex/1k/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-cp"
        ],
        "2": [
          "maxrects-cp"
        ],
        "3": [
          "maxrects-cp"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": -0.001,
          "fillRegret": -0.001,
          "wins": 35,
          "winShare": 1,
          "msMean": 3.71
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": -0.001,
          "fillRegret": -0.001,
          "wins": 35,
          "winShare": 1,
          "msMean": 3.71
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": -0.001,
          "fillRegret": -0.001,
          "wins": 35,
          "winShare": 1,
          "msMean": 3.71
        }
      },
      "prefixMedianMs": {
        "1": 2.383,
        "2": 2.383,
        "3": 2.383
      },
      "defaultMembers": 1
    },
    "convex/1k/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "shelf-best"
        ],
        "2": [
          "shelf-best"
        ],
        "3": [
          "shelf-best"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.001,
          "wins": 35,
          "winShare": 1,
          "msMean": 19.138
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.001,
          "wins": 35,
          "winShare": 1,
          "msMean": 19.138
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.001,
          "wins": 35,
          "winShare": 1,
          "msMean": 19.138
        }
      },
      "prefixMedianMs": {
        "1": 18.965,
        "2": 18.965,
        "3": 18.965
      },
      "defaultMembers": 1
    },
    "ellipse/10/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-cp"
        ],
        "2": [
          "maxrects-cp",
          "skyline"
        ],
        "3": [
          "maxrects-cp",
          "skyline",
          "shelf"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0.005,
          "fillRegret": 0.061,
          "wins": 12,
          "winShare": 0.343,
          "msMean": 0.896
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0.001,
          "fillRegret": 0.026,
          "wins": 19,
          "winShare": 0.543,
          "msMean": 1.675
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0.001,
          "fillRegret": 0.016,
          "wins": 23,
          "winShare": 0.657,
          "msMean": 1.684
        }
      },
      "prefixMedianMs": {
        "1": 0.815,
        "2": 1.348,
        "3": 1.356
      },
      "defaultMembers": 3
    },
    "ellipse/10/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "skyline"
        ],
        "2": [
          "skyline",
          "maxrects-cp"
        ],
        "3": [
          "skyline",
          "maxrects-cp",
          "maxrects-bl"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0.003,
          "fillRegret": 0.059,
          "wins": 16,
          "winShare": 0.457,
          "msMean": 0.362
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.021,
          "wins": 25,
          "winShare": 0.714,
          "msMean": 1.407
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.005,
          "wins": 33,
          "winShare": 0.943,
          "msMean": 2.39
        }
      },
      "prefixMedianMs": {
        "1": 0.272,
        "2": 1.286,
        "3": 2.153
      },
      "defaultMembers": 3
    },
    "ellipse/100/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "maxrects-bssf"
        ],
        "3": [
          "maxrects-bl",
          "maxrects-bssf",
          "maxrects-baf"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0.001,
          "fillRegret": 0.003,
          "wins": 27,
          "winShare": 0.771,
          "msMean": 3.074
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.003,
          "wins": 32,
          "winShare": 0.914,
          "msMean": 5.854
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.002,
          "wins": 33,
          "winShare": 0.943,
          "msMean": 8.393
        }
      },
      "prefixMedianMs": {
        "1": 2.802,
        "2": 5.274,
        "3": 7.336
      },
      "defaultMembers": 3
    },
    "ellipse/100/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "skyline"
        ],
        "3": [
          "maxrects-bl",
          "skyline",
          "maxrects-cp"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.002,
          "wins": 30,
          "winShare": 0.857,
          "msMean": 5.351
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.001,
          "wins": 34,
          "winShare": 0.971,
          "msMean": 7.226
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 17.469
        }
      },
      "prefixMedianMs": {
        "1": 5.179,
        "2": 7.083,
        "3": 17.026
      },
      "defaultMembers": 3
    },
    "ellipse/1k/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bssf"
        ],
        "2": [
          "maxrects-bssf",
          "maxrects-baf"
        ],
        "3": [
          "maxrects-bssf",
          "maxrects-baf",
          "maxrects-cp"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.003,
          "wins": 30,
          "winShare": 0.857,
          "msMean": 5.533
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.002,
          "wins": 32,
          "winShare": 0.914,
          "msMean": 11.173
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.002,
          "wins": 33,
          "winShare": 0.943,
          "msMean": 16.218
        }
      },
      "prefixMedianMs": {
        "1": 5.067,
        "2": 9.708,
        "3": 13.112
      },
      "defaultMembers": 3
    },
    "ellipse/1k/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl"
        ],
        "3": [
          "maxrects-bl"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 42.562
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 42.562
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 42.562
        }
      },
      "prefixMedianMs": {
        "1": 43.159,
        "2": 43.159,
        "3": 43.159
      },
      "defaultMembers": 1
    },
    "holes/10/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "maxrects-cp"
        ],
        "3": [
          "maxrects-bl",
          "maxrects-cp",
          "maxrects-blsf"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0.001,
          "fillRegret": 0.05,
          "wins": 19,
          "winShare": 0.543,
          "msMean": 0.392
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.019,
          "wins": 26,
          "winShare": 0.743,
          "msMean": 0.671
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.01,
          "wins": 30,
          "winShare": 0.857,
          "msMean": 1.068
        }
      },
      "prefixMedianMs": {
        "1": 0.377,
        "2": 0.652,
        "3": 1.036
      },
      "defaultMembers": 3
    },
    "holes/10/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "maxrects-baf"
        ],
        "3": [
          "maxrects-bl",
          "maxrects-baf",
          "shelf-best"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.014,
          "wins": 23,
          "winShare": 0.657,
          "msMean": 0.4
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.007,
          "wins": 27,
          "winShare": 0.771,
          "msMean": 0.951
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.006,
          "wins": 30,
          "winShare": 0.857,
          "msMean": 1.115
        }
      },
      "prefixMedianMs": {
        "1": 0.391,
        "2": 0.912,
        "3": 1.024
      },
      "defaultMembers": 3
    },
    "holes/100/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "maxrects-cp"
        ],
        "3": [
          "maxrects-bl",
          "maxrects-cp",
          "maxrects-bssf"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0.003,
          "fillRegret": 0.005,
          "wins": 20,
          "winShare": 0.571,
          "msMean": 0.636
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0.001,
          "fillRegret": 0.002,
          "wins": 30,
          "winShare": 0.857,
          "msMean": 1.13
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 1.869
        }
      },
      "prefixMedianMs": {
        "1": 0.599,
        "2": 1.068,
        "3": 1.804
      },
      "defaultMembers": 3
    },
    "holes/100/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "shelf-first"
        ],
        "3": [
          "maxrects-bl",
          "shelf-first",
          "maxrects-bssf"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.004,
          "wins": 32,
          "winShare": 0.914,
          "msMean": 0.882
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.002,
          "wins": 34,
          "winShare": 0.971,
          "msMean": 1.948
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 3.03
        }
      },
      "prefixMedianMs": {
        "1": 0.837,
        "2": 1.942,
        "3": 3.011
      },
      "defaultMembers": 3
    },
    "holes/1k/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-cp"
        ],
        "2": [
          "maxrects-cp"
        ],
        "3": [
          "maxrects-cp"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 1.206
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 1.206
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 1.206
        }
      },
      "prefixMedianMs": {
        "1": 1.011,
        "2": 1.011,
        "3": 1.011
      },
      "defaultMembers": 1
    },
    "holes/1k/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "shelf-first"
        ],
        "2": [
          "shelf-first",
          "maxrects-bl"
        ],
        "3": [
          "shelf-first",
          "maxrects-bl"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.003,
          "wins": 30,
          "winShare": 0.857,
          "msMean": 28.492
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": -0.002,
          "wins": 35,
          "winShare": 1,
          "msMean": 36.636
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": -0.002,
          "wins": 35,
          "winShare": 1,
          "msMean": 36.636
        }
      },
      "prefixMedianMs": {
        "1": 29.151,
        "2": 37.4,
        "3": 37.4
      },
      "defaultMembers": 2
    },
    "polygon/10/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "maxrects-blsf"
        ],
        "3": [
          "maxrects-bl",
          "maxrects-blsf",
          "shelf-best"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0.001,
          "fillRegret": 0.08,
          "wins": 18,
          "winShare": 0.514,
          "msMean": 0.209
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.034,
          "wins": 22,
          "winShare": 0.629,
          "msMean": 0.393
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.013,
          "wins": 29,
          "winShare": 0.829,
          "msMean": 0.445
        }
      },
      "prefixMedianMs": {
        "1": 0.178,
        "2": 0.351,
        "3": 0.401
      },
      "defaultMembers": 3
    },
    "polygon/10/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "shelf-best"
        ],
        "3": [
          "maxrects-bl",
          "shelf-best",
          "maxrects-blsf"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.04,
          "wins": 21,
          "winShare": 0.6,
          "msMean": 0.233
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.009,
          "wins": 28,
          "winShare": 0.8,
          "msMean": 0.278
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.008,
          "wins": 30,
          "winShare": 0.857,
          "msMean": 0.482
        }
      },
      "prefixMedianMs": {
        "1": 0.175,
        "2": 0.222,
        "3": 0.408
      },
      "defaultMembers": 3
    },
    "polygon/100/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "maxrects-cp"
        ],
        "3": [
          "maxrects-bl",
          "maxrects-cp",
          "maxrects-bssf"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0.001,
          "fillRegret": 0.002,
          "wins": 28,
          "winShare": 0.8,
          "msMean": 0.369
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.001,
          "wins": 32,
          "winShare": 0.914,
          "msMean": 0.785
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 34,
          "winShare": 0.971,
          "msMean": 1.303
        }
      },
      "prefixMedianMs": {
        "1": 0.378,
        "2": 0.809,
        "3": 1.33
      },
      "defaultMembers": 3
    },
    "polygon/100/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "maxrects-blsf"
        ],
        "3": [
          "maxrects-bl",
          "maxrects-blsf",
          "shelf-first"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.019,
          "wins": 26,
          "winShare": 0.743,
          "msMean": 0.552
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.007,
          "wins": 29,
          "winShare": 0.829,
          "msMean": 1.036
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 1.406
        }
      },
      "prefixMedianMs": {
        "1": 0.519,
        "2": 0.989,
        "3": 1.357
      },
      "defaultMembers": 3
    },
    "polygon/1k/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-cp"
        ],
        "2": [
          "maxrects-cp"
        ],
        "3": [
          "maxrects-cp"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 0.981
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 0.981
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 0.981
        }
      },
      "prefixMedianMs": {
        "1": 0.769,
        "2": 0.769,
        "3": 0.769
      },
      "defaultMembers": 1
    },
    "polygon/1k/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "shelf-first"
        ],
        "2": [
          "shelf-first",
          "maxrects-blsf"
        ],
        "3": [
          "shelf-first",
          "maxrects-blsf",
          "maxrects-bl"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.013,
          "wins": 31,
          "winShare": 0.886,
          "msMean": 11.31
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": -0.001,
          "wins": 34,
          "winShare": 0.971,
          "msMean": 16.795
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": -0.001,
          "wins": 35,
          "winShare": 1,
          "msMean": 24.24
        }
      },
      "prefixMedianMs": {
        "1": 10.381,
        "2": 16.052,
        "3": 23.567
      },
      "defaultMembers": 3
    },
    "rect/1/identical": {
      "inputs": 10,
      "thin": true
    },
    "rect/10/heavyTail": {
      "inputs": 40,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "rows"
        ],
        "3": [
          "maxrects-bl",
          "rows",
          "maxrects-blsf"
        ]
      },
      "train": {
        "1": {
          "inputs": 40,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.049,
          "wins": 22,
          "winShare": 0.55,
          "msMean": 0.02
        },
        "2": {
          "inputs": 40,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.013,
          "wins": 29,
          "winShare": 0.725,
          "msMean": 0.047
        },
        "3": {
          "inputs": 40,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.007,
          "wins": 33,
          "winShare": 0.825,
          "msMean": 0.07
        }
      },
      "prefixMedianMs": {
        "1": 0.016,
        "2": 0.037,
        "3": 0.055
      },
      "defaultMembers": 3
    },
    "rect/10/identical": {
      "inputs": 5,
      "thin": true
    },
    "rect/10/uniform": {
      "inputs": 40,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "shelf-next"
        ],
        "3": [
          "maxrects-bl",
          "shelf-next",
          "maxrects-baf"
        ]
      },
      "train": {
        "1": {
          "inputs": 40,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.035,
          "wins": 27,
          "winShare": 0.675,
          "msMean": 0.043
        },
        "2": {
          "inputs": 40,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.016,
          "wins": 33,
          "winShare": 0.825,
          "msMean": 0.114
        },
        "3": {
          "inputs": 40,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.001,
          "wins": 37,
          "winShare": 0.925,
          "msMean": 0.173
        }
      },
      "prefixMedianMs": {
        "1": 0.027,
        "2": 0.086,
        "3": 0.11
      },
      "defaultMembers": 3
    },
    "rect/100/heavyTail": {
      "inputs": 45,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "maxrects-cp"
        ],
        "3": [
          "maxrects-bl",
          "maxrects-cp",
          "maxrects-bssf"
        ]
      },
      "train": {
        "1": {
          "inputs": 45,
          "hardRegret": 0,
          "excessAreaRegret": 0.002,
          "fillRegret": 0.003,
          "wins": 30,
          "winShare": 0.667,
          "msMean": 0.097
        },
        "2": {
          "inputs": 45,
          "hardRegret": 0,
          "excessAreaRegret": 0.001,
          "fillRegret": 0.001,
          "wins": 38,
          "winShare": 0.844,
          "msMean": 0.208
        },
        "3": {
          "inputs": 45,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.001,
          "wins": 42,
          "winShare": 0.933,
          "msMean": 0.351
        }
      },
      "prefixMedianMs": {
        "1": 0.083,
        "2": 0.15,
        "3": 0.349
      },
      "defaultMembers": 3
    },
    "rect/100/identical": {
      "inputs": 5,
      "thin": true
    },
    "rect/100/uniform": {
      "inputs": 40,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-bl"
        ],
        "2": [
          "maxrects-bl",
          "shelf-first"
        ],
        "3": [
          "maxrects-bl",
          "shelf-first",
          "maxrects-blsf"
        ]
      },
      "train": {
        "1": {
          "inputs": 40,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.006,
          "wins": 31,
          "winShare": 0.775,
          "msMean": 0.208
        },
        "2": {
          "inputs": 40,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.001,
          "wins": 38,
          "winShare": 0.95,
          "msMean": 0.413
        },
        "3": {
          "inputs": 40,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 39,
          "winShare": 0.975,
          "msMean": 0.648
        }
      },
      "prefixMedianMs": {
        "1": 0.196,
        "2": 0.367,
        "3": 0.519
      },
      "defaultMembers": 3
    },
    "rect/1k/heavyTail": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "maxrects-cp"
        ],
        "2": [
          "maxrects-cp"
        ],
        "3": [
          "maxrects-cp"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 0.679
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 0.679
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0,
          "wins": 35,
          "winShare": 1,
          "msMean": 0.679
        }
      },
      "prefixMedianMs": {
        "1": 0.554,
        "2": 0.554,
        "3": 0.554
      },
      "defaultMembers": 1
    },
    "rect/1k/uniform": {
      "inputs": 35,
      "thin": false,
      "sets": {
        "1": [
          "shelf-first"
        ],
        "2": [
          "shelf-first",
          "maxrects-bl"
        ],
        "3": [
          "shelf-first",
          "maxrects-bl"
        ]
      },
      "train": {
        "1": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": 0.004,
          "wins": 30,
          "winShare": 0.857,
          "msMean": 4.737
        },
        "2": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": -0.001,
          "wins": 35,
          "winShare": 1,
          "msMean": 9.299
        },
        "3": {
          "inputs": 35,
          "hardRegret": 0,
          "excessAreaRegret": 0,
          "fillRegret": -0.001,
          "wins": 35,
          "winShare": 1,
          "msMean": 9.299
        }
      },
      "prefixMedianMs": {
        "1": 4.185,
        "2": 8.887,
        "3": 8.887
      },
      "defaultMembers": 2
    }
  }
};
