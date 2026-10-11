// Template home recipes. Nutrients are calculated by build-seed.mjs from the listed ingredient
// gram weights (raw/as-bought) using the seed's USDA values, mirroring calculateRecipe() in
// src/domain/nutrition.ts. Proportions are typical home quantities chosen by the curator; they are
// stated in full in each food's notes so users can compare with their own cooking.
//
// Yield: no cooked-yield assumption is made (water absorbed/evaporated varies too much), so every
// template is servings-only: one serving = 1/servings of the whole batch. Cooking water is not
// listed because it adds no nutrients we track (tap-water minerals ignored).
// Ingredient `key`s refer to `key` fields in curation/foods.mjs.

const g = (key, grams) => ({ key, grams });

export const TEMPLATES = [
  {
    id: 'tpl:dal-tadka', name: 'Dal tadka (toor dal, home template)', servings: 4,
    aliases: ['dal tadka', 'dal fry', 'tadka dal', 'toor dal tadka', 'arhar dal', 'दाल तड़का', 'paruppu', 'pappu'],
    tags: ['pulse', 'north-indian'],
    ingredients: [g('toor_raw', 100), g('ghee', 10), g('cumin', 2), g('garlic', 5), g('onion', 40), g('tomato', 50), g('green_chilli', 5), g('turmeric', 1), g('red_chilli', 1), g('salt', 4), g('coriander_leaves', 5)],
    method: 'Pressure-cook dal with turmeric and water; temper cumin, garlic, onion, chilli and tomato in ghee; combine.',
  },
  {
    id: 'tpl:masoor-dal', name: 'Masoor dal (red lentils, home template)', servings: 4,
    aliases: ['masoor dal', 'masoor ki dal', 'red lentil dal', 'musur dal', 'मसूर दाल'],
    tags: ['pulse'],
    ingredients: [g('masoor_raw', 100), g('sunflower_oil', 10), g('cumin', 2), g('garlic', 5), g('onion', 40), g('tomato', 50), g('turmeric', 1), g('red_chilli', 1), g('salt', 4)],
  },
  {
    id: 'tpl:moong-dal', name: 'Sabut moong dal (whole green moong, home template)', servings: 4,
    aliases: ['moong dal', 'sabut moong', 'green moong dal', 'mung dal', 'मूंग दाल'],
    tags: ['pulse'],
    ingredients: [g('moong_raw', 100), g('ghee', 10), g('cumin', 2), g('onion', 40), g('tomato', 50), g('ginger', 5), g('garlic', 5), g('turmeric', 1), g('red_chilli', 1), g('salt', 4)],
    notes: 'Uses whole green moong; USDA has no separate yellow (split, dehusked) moong dal record.',
  },
  {
    id: 'tpl:sambar', name: 'Sambar (home template)', servings: 5,
    aliases: ['sambar', 'sambhar', 'சாம்பார்', 'సాంబారు', 'ಸಾಂಬಾರ್', 'सांबर'],
    tags: ['pulse', 'south-indian'],
    ingredients: [g('toor_raw', 75), g('tamarind', 15), g('drumstick', 50), g('pumpkin', 100), g('onion', 50), g('tomato', 50), g('sunflower_oil', 10), g('mustard_seed', 2), g('fenugreek_seed', 1), g('coriander_seed', 5), g('red_chilli', 3), g('cumin', 1), g('turmeric', 1), g('salt', 6)],
    notes: 'Sambar powder is represented by its main spices (coriander seed, red chilli, cumin, fenugreek); ready-made powders differ. Asafoetida and curry leaves are omitted (no USDA record; tiny amounts).',
  },
  {
    id: 'tpl:rajma', name: 'Rajma masala (home template)', servings: 4,
    aliases: ['rajma', 'rajma masala', 'rajma curry', 'राजमा', 'rajmah'],
    tags: ['pulse', 'north-indian'],
    ingredients: [g('rajma_raw', 150), g('sunflower_oil', 20), g('onion', 100), g('tomato', 150), g('ginger', 10), g('garlic', 10), g('green_chilli', 5), g('cumin', 2), g('turmeric', 1), g('red_chilli', 2), g('coriander_seed', 3), g('salt', 6)],
  },
  {
    id: 'tpl:chole', name: 'Chole / chana masala (home template)', servings: 4,
    aliases: ['chole', 'chhole', 'chana masala', 'chole masala', 'छोले', 'kadala curry', 'chana curry'],
    tags: ['pulse', 'north-indian'],
    ingredients: [g('chana_raw', 150), g('sunflower_oil', 20), g('onion', 100), g('tomato', 150), g('ginger', 10), g('garlic', 10), g('green_chilli', 5), g('cumin', 2), g('turmeric', 1), g('red_chilli', 2), g('coriander_seed', 3), g('salt', 6)],
    notes: 'Uses USDA chickpeas (kabuli type). Kerala kadala curry uses black chickpeas and coconut and will differ.',
  },
  {
    id: 'tpl:khichdi', name: 'Moong dal khichdi (home template)', servings: 3,
    aliases: ['khichdi', 'khichri', 'khichuri', 'खिचड़ी', 'dal khichdi'],
    tags: ['grain', 'pulse'],
    ingredients: [g('rice_raw', 100), g('moong_raw', 50), g('ghee', 10), g('cumin', 2), g('turmeric', 1), g('salt', 4)],
    notes: 'Uses whole green moong (no USDA yellow moong dal record).',
  },
  {
    id: 'tpl:jeera-rice', name: 'Jeera rice (home template)', servings: 3,
    aliases: ['jeera rice', 'zeera rice', 'cumin rice', 'जीरा राइस'],
    tags: ['grain', 'north-indian'],
    ingredients: [g('rice_raw', 150), g('ghee', 10), g('cumin', 3), g('salt', 3)],
  },
  {
    id: 'tpl:veg-pulao', name: 'Vegetable pulao (home template)', servings: 4,
    aliases: ['veg pulao', 'vegetable pulao', 'pulao', 'pulav', 'pilaf', 'पुलाव'],
    tags: ['grain'],
    ingredients: [g('rice_raw', 150), g('ghee', 15), g('onion', 50), g('carrot', 50), g('peas', 50), g('french_beans', 30), g('cumin', 2), g('cloves', 0.5), g('cinnamon', 0.5), g('cardamom', 0.5), g('salt', 4)],
  },
  {
    id: 'tpl:curd-rice', name: 'Curd rice (home template)', servings: 3,
    aliases: ['curd rice', 'thayir sadam', 'தயிர் சாதம்', 'daddojanam', 'perugu annam', 'mosaru anna', 'dahi chawal'],
    tags: ['grain', 'dairy', 'south-indian'],
    ingredients: [g('rice_raw', 100), g('curd', 200), g('milk', 50), g('sunflower_oil', 5), g('mustard_seed', 1), g('ginger', 5), g('green_chilli', 3), g('salt', 3), g('coriander_leaves', 3)],
  },
  {
    id: 'tpl:upma', name: 'Rava upma (home template)', servings: 3,
    aliases: ['upma', 'rava upma', 'sooji upma', 'uppittu', 'उपमा', 'உப்புமா'],
    tags: ['grain', 'south-indian'],
    ingredients: [g('sooji', 100), g('sunflower_oil', 15), g('mustard_seed', 2), g('onion', 50), g('green_chilli', 5), g('ginger', 5), g('peas', 30), g('salt', 3), g('coriander_leaves', 3)],
    notes: 'Urad/chana dal and curry leaves in the tempering are omitted.',
  },
  {
    id: 'tpl:aloo-sabzi', name: 'Aloo sabzi, dry (home template)', servings: 4,
    aliases: ['aloo sabzi', 'aloo ki sabzi', 'jeera aloo', 'potato sabzi', 'aloo fry', 'batata bhaji', 'आलू की सब्ज़ी'],
    tags: ['vegetable'],
    ingredients: [g('potato', 400), g('sunflower_oil', 20), g('cumin', 2), g('turmeric', 1), g('red_chilli', 2), g('green_chilli', 5), g('salt', 5), g('coriander_leaves', 5)],
  },
  {
    id: 'tpl:aloo-gobi', name: 'Aloo gobi (home template)', servings: 4,
    aliases: ['aloo gobi', 'aloo gobhi', 'gobi aloo', 'आलू गोभी'],
    tags: ['vegetable', 'north-indian'],
    ingredients: [g('cauliflower', 300), g('potato', 200), g('sunflower_oil', 20), g('cumin', 2), g('turmeric', 1), g('red_chilli', 2), g('coriander_seed', 3), g('ginger', 5), g('salt', 5)],
  },
  {
    id: 'tpl:bhindi', name: 'Bhindi masala, dry (home template)', servings: 3,
    aliases: ['bhindi masala', 'bhindi sabzi', 'bhindi fry', 'okra fry', 'vendakkai poriyal'],
    tags: ['vegetable'],
    ingredients: [g('okra', 300), g('sunflower_oil', 20), g('onion', 80), g('turmeric', 1), g('red_chilli', 2), g('coriander_seed', 3), g('salt', 4)],
  },
  {
    id: 'tpl:baingan-bharta', name: 'Baingan bharta (home template)', servings: 4,
    aliases: ['baingan bharta', 'baingan ka bharta', 'begun pora', 'vangyache bharit', 'बैंगन भर्ता'],
    tags: ['vegetable', 'north-indian'],
    ingredients: [g('eggplant', 500), g('mustard_oil', 20), g('onion', 100), g('tomato', 100), g('ginger', 5), g('garlic', 5), g('green_chilli', 5), g('red_chilli', 2), g('salt', 5), g('coriander_leaves', 5)],
    notes: 'Eggplant weight is whole raw eggplant before roasting and peeling (roasted skin discarded in practice, slightly lowering fibre).',
  },
  {
    id: 'tpl:roti', name: 'Roti / phulka, plain (home template, from atta)', servings: 4, servingLabel: '1 roti (≈30 g atta)',
    aliases: ['roti', 'phulka', 'chapati', 'chapathi', 'rotli', 'fulka', 'home roti', 'रोटी', 'चपाती'],
    tags: ['grain', 'bread'],
    ingredients: [g('atta', 120)],
    notes: 'Four rotis from 120 g atta (about 30 g flour each) with no fat. Larger or smaller rotis scale proportionally; add ghee separately if used.',
  },
  {
    id: 'tpl:plain-paratha', name: 'Plain paratha (home template)', servings: 3, servingLabel: '1 paratha (≈50 g atta)',
    aliases: ['paratha', 'parantha', 'plain paratha', 'tawa paratha', 'पराठा'],
    tags: ['grain', 'bread', 'north-indian'],
    ingredients: [g('atta', 150), g('ghee', 20), g('salt', 2)],
  },
  {
    id: 'tpl:aloo-paratha', name: 'Aloo paratha (home template)', servings: 4, servingLabel: '1 paratha',
    aliases: ['aloo paratha', 'alu paratha', 'potato paratha', 'आलू पराठा'],
    tags: ['grain', 'bread', 'north-indian'],
    ingredients: [g('atta', 150), g('potato', 200), g('sunflower_oil', 20), g('green_chilli', 5), g('coriander_leaves', 5), g('red_chilli', 1), g('salt', 4)],
  },
  {
    id: 'tpl:besan-chilla', name: 'Besan chilla (home template)', servings: 3, servingLabel: '1 chilla',
    aliases: ['besan chilla', 'besan cheela', 'chilla', 'pudla', 'besan ka cheela', 'बेसन चीला'],
    tags: ['pulse'],
    ingredients: [g('besan', 100), g('onion', 40), g('tomato', 40), g('green_chilli', 5), g('coriander_leaves', 5), g('sunflower_oil', 10), g('salt', 2), g('turmeric', 0.5)],
  },
  {
    id: 'tpl:sabudana-khichdi', name: 'Sabudana khichdi (home template)', servings: 3,
    aliases: ['sabudana khichdi', 'sabudana khichadi', 'साबूदाना खिचड़ी', 'sago khichdi'],
    tags: ['grain'],
    ingredients: [g('sabudana', 150), g('peanuts', 40), g('potato', 100), g('ghee', 15), g('cumin', 2), g('green_chilli', 5), g('salt', 3), g('lime_juice', 5)],
  },
  {
    id: 'tpl:egg-bhurji', name: 'Egg bhurji (home template)', servings: 2,
    aliases: ['egg bhurji', 'anda bhurji', 'masala scrambled eggs', 'अंडा भुर्जी'],
    tags: ['egg'],
    ingredients: [g('egg', 150), g('sunflower_oil', 10), g('onion', 40), g('tomato', 40), g('green_chilli', 3), g('turmeric', 0.5), g('salt', 1.5), g('coriander_leaves', 3)],
    notes: 'About 3 large eggs (USDA large egg ≈ 50 g without shell).',
  },
  {
    id: 'tpl:chicken-curry', name: 'Chicken curry (home template)', servings: 5,
    aliases: ['chicken curry', 'murgh curry', 'chicken masala', 'kozhi curry', 'kodi kura', 'murgir jhol', 'चिकन करी'],
    tags: ['meat'],
    ingredients: [g('chicken_raw', 500), g('sunflower_oil', 30), g('onion', 150), g('tomato', 150), g('ginger', 10), g('garlic', 10), g('curd', 50), g('turmeric', 2), g('red_chilli', 3), g('coriander_seed', 5), g('cumin', 2), g('salt', 8), g('coriander_leaves', 5)],
    notes: 'Chicken weight is boneless, skinless meat. With bone-in pieces, weigh the edible meat only.',
  },
  {
    id: 'tpl:mutton-curry', name: 'Mutton (goat) curry (home template)', servings: 5,
    aliases: ['mutton curry', 'goat curry', 'mutton masala', 'gosht curry', 'kosha mangsho', 'mutton kuzhambu'],
    tags: ['meat'],
    ingredients: [g('goat_raw', 500), g('mustard_oil', 30), g('onion', 150), g('tomato', 100), g('ginger', 10), g('garlic', 10), g('curd', 50), g('turmeric', 2), g('red_chilli', 3), g('coriander_seed', 5), g('cumin', 2), g('cinnamon', 1), g('cloves', 0.5), g('cardamom', 0.5), g('salt', 8)],
    notes: 'Goat weight is edible meat (no bone). USDA goat is lean; fattier cuts add energy.',
  },
  {
    id: 'tpl:kadhi', name: 'Kadhi (home template)', servings: 3,
    aliases: ['kadhi', 'kadi', 'karhi', 'कढ़ी', 'dahi kadhi'],
    tags: ['dairy', 'pulse'],
    ingredients: [g('curd', 200), g('besan', 30), g('sunflower_oil', 10), g('mustard_seed', 1), g('cumin', 1), g('fenugreek_seed', 1), g('turmeric', 1), g('red_chilli', 1), g('ginger', 5), g('green_chilli', 5), g('salt', 4)],
    notes: 'Plain kadhi without pakoras.',
  },
  {
    id: 'tpl:cucumber-raita', name: 'Cucumber raita (home template)', servings: 3,
    aliases: ['raita', 'kheera raita', 'cucumber raita', 'रायता', 'curd raita'],
    tags: ['dairy'],
    ingredients: [g('curd', 200), g('cucumber', 100), g('cumin', 1), g('salt', 2), g('mint', 3)],
  },
  {
    id: 'tpl:masala-chai', name: 'Masala chai with sugar (home template)', servings: 2, servingLabel: '1 cup (≈200 ml)',
    aliases: ['chai', 'masala chai', 'milk tea', 'adrak chai', 'चाय', 'cha', 'tea with milk and sugar'],
    tags: ['beverage'],
    ingredients: [g('tea_brewed', 200), g('milk', 200), g('sugar', 20), g('ginger', 5), g('cardamom', 1)],
    notes: 'Brewed tea stands in for tea leaves boiled in water. 10 g sugar per cup; adjust if you take more or less.',
  },
  {
    id: 'tpl:sweet-lassi', name: 'Sweet lassi (home template)', servings: 1, servingLabel: '1 glass',
    aliases: ['lassi', 'sweet lassi', 'meethi lassi', 'लस्सी'],
    tags: ['beverage', 'dairy', 'north-indian'],
    ingredients: [g('curd', 200), g('milk', 50), g('sugar', 20), g('cardamom', 0.3)],
  },
];
