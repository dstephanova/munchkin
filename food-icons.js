// Cute little food icons for meals without a photo. Each is a tiny SVG with a happy face.
// The AI picks the best one when it counts a meal; a word match is the backup.

const INK = "#4a2a6b";
const face = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
  <ellipse cx="-5" cy="0" rx="1.6" ry="2" fill="${INK}"/><ellipse cx="5" cy="0" rx="1.6" ry="2" fill="${INK}"/>
  <path d="M-2.6 3.2 Q0 5.6 2.6 3.2" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <ellipse cx="-8.2" cy="3.4" rx="2" ry="1.2" fill="#ff8fb8" opacity=".75"/><ellipse cx="8.2" cy="3.4" rx="2" ry="1.2" fill="#ff8fb8" opacity=".75"/></g>`;
const S = (body) => `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
const L = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;
const bowl = (fill = "#c9b6ff") => `<path d="M10 32 H54 Q53 50 32 52 Q11 50 10 32 Z" fill="${fill}" ${L}/>`;

export const FOOD_ICONS = {
  plate: { label: "Meal", svg: S(`<ellipse cx="32" cy="38" rx="26" ry="17" fill="#fff" ${L}/><ellipse cx="32" cy="38" rx="18" ry="11" fill="#efe6ff"/><path d="M15 38 Q14 28 24 27 Q34 26 34 34 Q34 42 24 43 Q16 44 15 38 Z" fill="#c9566b" ${L}/><path d="M19 32 Q23 30 27 32" stroke="#ffd6dd" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="40" cy="31" r="6" fill="#57c785"/><circle cx="46" cy="36" r="5" fill="#7ad98e"/><circle cx="41" cy="36" r="2.2" fill="#ff6b7d"/><circle cx="40" cy="45" r="4.4" fill="#ffd36e" ${L}/><circle cx="47" cy="43" r="3.6" fill="#ffd36e" ${L}/>${face(25, 36, .65).replace(/#4a2a6b/g, "#fff")}`) },
  pizza: { label: "Pizza", svg: S(`<path d="M10 16 Q32 8 54 16 L32 56 Z" fill="#ffd36e" ${L}/><path d="M10 16 Q32 8 54 16 L51 22 Q32 15 13 22 Z" fill="#e8a54b" ${L}/><circle cx="24" cy="27" r="3.4" fill="#ff6b7d"/><circle cx="40" cy="28" r="3" fill="#ff6b7d"/><circle cx="33" cy="42" r="2.6" fill="#ff6b7d"/>${face(32, 32, .8)}`) },
  burger: { label: "Burger", svg: S(`<path d="M12 30 Q12 12 32 12 Q52 12 52 30 Z" fill="#f2b263" ${L}/><path d="M10 34 Q16 30 22 34 Q28 30 34 34 Q40 30 46 34 Q50 31 54 34" stroke="#57c785" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="11" y="36" width="42" height="7" rx="3.5" fill="#8a4b2f" ${L}/><path d="M12 45 H52 Q52 53 32 53 Q12 53 12 45 Z" fill="#f2b263" ${L}/>${face(32, 22, .85)}`) },
  sandwich: { label: "Sandwich", svg: S(`<path d="M8 46 L32 12 L56 46 Z" fill="#f6d79a" ${L}/><path d="M14 44 L32 18 L50 44 Z" fill="#fff3d6"/><path d="M8 46 H56 V52 H8 Z" fill="#57c785" ${L}/>${face(32, 35, .8)}`) },
  salad: { label: "Salad", svg: S(`<circle cx="22" cy="28" r="8" fill="#7ad98e"/><circle cx="34" cy="24" r="9" fill="#57c785"/><circle cx="44" cy="29" r="7" fill="#9be3a3"/><circle cx="28" cy="27" r="3" fill="#ff6b7d"/>${bowl("#ffffff")}${face(32, 41, .85)}`) },
  soup: { label: "Soup", svg: S(`<path d="M24 10 Q20 15 24 20 M32 8 Q28 14 32 20 M40 10 Q36 15 40 20" stroke="#c9b6ff" stroke-width="2.4" fill="none" stroke-linecap="round"/><ellipse cx="32" cy="32" rx="22" ry="5" fill="#ffb35c"/>${bowl()}${face(32, 41, .85)}`) },
  pasta: { label: "Pasta", svg: S(`<path d="M16 30 Q22 18 28 28 Q32 16 38 28 Q42 18 48 30" stroke="#ffd36e" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="30" cy="24" r="3.4" fill="#ff6b7d"/>${bowl("#ffffff")}${face(32, 41, .85)}`) },
  rice: { label: "Rice", svg: S(`<path d="M44 6 L30 28 M50 9 L34 29" stroke="#c98a5a" stroke-width="2.6" stroke-linecap="round"/><path d="M13 32 Q16 20 32 20 Q48 20 51 32 Z" fill="#fff" ${L}/>${bowl("#ff9fc4")}${face(32, 41, .85)}`) },
  sushi: { label: "Sushi", svg: S(`<ellipse cx="32" cy="22" rx="18" ry="7" fill="#fff" ${L}/><ellipse cx="32" cy="22" rx="9" ry="3.5" fill="#ff9a76"/><path d="M14 22 V42 Q32 52 50 42 V22" fill="#34405a" ${L}/>${face(32, 36, .85).replace(/#4a2a6b/g, "#fff")}`) },
  egg: { label: "Egg", svg: S(`<path d="M10 34 Q8 18 24 16 Q34 8 46 16 Q58 22 52 36 Q50 50 32 50 Q12 52 10 34 Z" fill="#fff" ${L}/><circle cx="32" cy="32" r="10" fill="#ffc93c" ${L}/>${face(32, 32, .7)}`) },
  toast: { label: "Toast", svg: S(`<path d="M14 52 V26 Q8 24 10 16 Q14 8 32 8 Q50 8 54 16 Q56 24 50 26 V52 Z" fill="#e8a54b" ${L}/><path d="M19 47 V27 Q15 24 16 19 Q19 13 32 13 Q45 13 48 19 Q49 24 45 27 V47 Z" fill="#ffe3a3"/>${face(32, 32, .9)}`) },
  oats: { label: "Breakfast bowl", svg: S(`<ellipse cx="32" cy="32" rx="22" ry="5" fill="#fff5e0"/><circle cx="22" cy="30" r="3.2" fill="#ff6b7d"/><circle cx="40" cy="29" r="3.4" fill="#7c6cff"/><path d="M30 30 Q34 26 38 30" stroke="#ffd36e" stroke-width="3" fill="none" stroke-linecap="round"/>${bowl("#ffd6e7")}${face(32, 41, .85)}`) },
  chicken: { label: "Chicken", svg: S(`<path d="M18 38 Q10 26 20 16 Q32 6 44 18 Q52 28 42 38 Q34 44 26 42 Z" fill="#e09a52" ${L}/><path d="M26 42 L16 52" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M26 42 L16 52" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="13" cy="54" r="4" fill="#fff" ${L}/><circle cx="18" cy="56" r="3.4" fill="#fff" ${L}/>${face(32, 26, .85)}`) },
  meat: { label: "Meat", svg: S(`<path d="M10 30 Q10 14 30 14 Q50 12 54 28 Q56 44 38 48 Q20 52 12 42 Z" fill="#c9566b" ${L}/><path d="M18 26 Q24 22 30 26" stroke="#ffd6dd" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="42" cy="38" r="5" fill="#fff" ${L}/>${face(28, 34, .85)}`) },
  fish: { label: "Fish", svg: S(`<path d="M8 32 Q22 14 42 22 L56 12 L52 32 L56 52 L42 42 Q22 50 8 32 Z" fill="#7cc4ff" ${L}/><path d="M30 24 Q34 32 30 40" stroke="${INK}" stroke-width="1.6" fill="none"/>${face(19, 31, .7)}`) },
  apple: { label: "Fruit", svg: S(`<path d="M32 18 Q20 10 12 20 Q4 36 18 50 Q26 56 32 52 Q38 56 46 50 Q60 36 52 20 Q44 10 32 18 Z" fill="#ff6b7d" ${L}/><path d="M32 18 Q32 10 36 6" stroke="#8a4b2f" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M36 12 Q44 6 48 12 Q42 16 36 12 Z" fill="#57c785"/>${face(32, 34, .95)}`) },
  banana: { label: "Banana", svg: S(`<path d="M12 18 Q10 44 34 50 Q50 52 54 42 Q46 46 34 40 Q20 32 18 16 Z" fill="#ffe066" ${L}/><path d="M12 18 L16 12" stroke="#8a4b2f" stroke-width="3" stroke-linecap="round"/>${face(30, 38, .75)}`) },
  veggies: { label: "Veggies", svg: S(`<path d="M24 22 Q34 18 44 22 L32 58 Z" fill="#ff9a3c" ${L}/><path d="M30 20 Q26 10 28 6 M34 20 Q34 10 38 6 M32 20 Q30 12 32 8" stroke="#57c785" stroke-width="3" fill="none" stroke-linecap="round"/>${face(33, 31, .7)}`) },
  cheese: { label: "Cheese", svg: S(`<path d="M8 44 L52 18 L56 26 V48 H8 Z" fill="#ffd36e" ${L}/><path d="M8 44 L52 18 L56 26 L12 50 Z" fill="#ffe7a1"/><circle cx="44" cy="38" r="3.4" fill="#f2b84b"/><circle cx="20" cy="47" r="2" fill="#f2b84b"/>${face(30, 40, .8)}`) },
  yogurt: { label: "Yogurt", svg: S(`<path d="M14 20 H50 L46 54 H18 Z" fill="#fff" ${L}/><path d="M14 20 H50 V26 H14 Z" fill="#ff9fc4" ${L}/><path d="M24 16 Q32 8 40 16" fill="#ffd6e7" ${L}/>${face(32, 39, .9)}`) },
  cake: { label: "Cake", svg: S(`<path d="M10 30 L46 18 L54 30 V50 H10 Z" fill="#ffe0ec" ${L}/><path d="M10 30 L46 18 L54 30 Z" fill="#ff9fc4" ${L}/><path d="M10 40 H54" stroke="#ff9fc4" stroke-width="3"/><circle cx="46" cy="14" r="4" fill="#ff4d6d"/>${face(30, 44, .8)}`) },
  cupcake: { label: "Dessert", svg: S(`<path d="M16 34 L20 56 H44 L48 34 Z" fill="#ff9fc4" ${L}/><path d="M24 36 L26 54 M32 36 V54 M40 36 L38 54" stroke="#ff7fae" stroke-width="2"/><path d="M12 34 Q10 24 20 22 Q20 12 32 12 Q44 12 44 22 Q54 24 52 34 Z" fill="#fff4f8" ${L}/><circle cx="32" cy="9" r="4.5" fill="#ff4d6d" ${L}/><circle cx="22" cy="26" r="1.4" fill="#7c6cff"/><circle cx="42" cy="25" r="1.4" fill="#57c785"/><circle cx="36" cy="18" r="1.4" fill="#ffd36e"/>${face(32, 44, .8)}`) },
  cookie: { label: "Cookie", svg: S(`<circle cx="32" cy="32" r="22" fill="#e3a35f" ${L}/><circle cx="20" cy="22" r="3" fill="#6b3b22"/><circle cx="44" cy="24" r="2.6" fill="#6b3b22"/><circle cx="42" cy="44" r="3" fill="#6b3b22"/><circle cx="20" cy="42" r="2.4" fill="#6b3b22"/>${face(32, 32, 1)}`) },
  chocolate: { label: "Chocolate", svg: S(`<rect x="12" y="12" width="40" height="42" rx="5" fill="#7a4a35" ${L}/><path d="M12 26 H52 M12 40 H52 M25 12 V54 M39 12 V54" stroke="#5e3626" stroke-width="2"/><path d="M12 36 V58 H52 V36 L44 40 L36 34 L28 40 L20 34 Z" fill="#c9b6ff" ${L}/>${face(32, 24, .8).replace(/#4a2a6b/g, "#ffe6d6")}`) },
  icecream: { label: "Ice cream", svg: S(`<path d="M20 30 L32 58 L44 30 Z" fill="#f2b263" ${L}/><circle cx="32" cy="22" r="14" fill="#ffc2dc" ${L}/><circle cx="32" cy="8" r="4" fill="#ff4d6d"/>${face(32, 22, .8)}`) },
  coffee: { label: "Coffee or tea", svg: S(`<path d="M24 8 Q20 13 24 18 M34 8 Q30 13 34 18" stroke="#c9b6ff" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M12 22 H46 V40 Q46 52 29 52 Q12 52 12 40 Z" fill="#fff" ${L}/><path d="M46 26 Q56 26 54 35 Q52 42 45 41" fill="none" ${L}/><ellipse cx="29" cy="23" rx="16" ry="3" fill="#a8693f"/>${face(29, 37, .9)}`) },
  juice: { label: "Juice", svg: S(`<path d="M40 4 L36 22" stroke="#ff6b7d" stroke-width="3" stroke-linecap="round"/><path d="M16 18 H48 L44 56 H20 Z" fill="#fff" ${L}/><path d="M18 28 H46 L44 54 H20 Z" fill="#ffb35c"/><circle cx="48" cy="18" r="6" fill="#ffd36e" ${L}/>${face(32, 40, .85)}`) },
  smoothie: { label: "Smoothie", svg: S(`<path d="M38 2 L34 18" stroke="#57c785" stroke-width="3" stroke-linecap="round"/><path d="M18 16 H46 L42 56 H22 Z" fill="#ff9fc4" ${L}/><path d="M16 16 Q32 8 48 16 Z" fill="#fff" ${L}/>${face(32, 36, .85)}`) },
  wine: { label: "Wine", svg: S(`<path d="M18 8 H46 Q48 30 32 34 Q16 30 18 8 Z" fill="#fff" ${L}/><path d="M18.5 16 H45.5 Q45 30 32 33 Q19 30 18.5 16 Z" fill="#b8305a"/><path d="M32 34 V52 M22 54 H42" ${L}/>${face(32, 23, .75).replace(/#4a2a6b/g, "#fff")}`) },
  beer: { label: "Beer", svg: S(`<path d="M44 24 Q56 24 54 34 Q52 44 44 42" fill="none" ${L}/><path d="M14 18 H44 V52 Q44 56 40 56 H18 Q14 56 14 52 Z" fill="#ffcf4d" ${L}/><path d="M12 18 Q14 8 22 12 Q28 4 34 10 Q42 6 46 16 Q46 22 40 22 H18 Q12 22 12 18 Z" fill="#fff" ${L}/>${face(29, 38, .9)}`) },
  chips: { label: "Chips", svg: S(`<path d="M14 12 L18 6 L22 12 L26 6 L30 12 L34 6 L38 12 L42 6 L46 12 L50 6 V58 L46 52 L42 58 L38 52 L34 58 L30 52 L26 58 L22 52 L18 58 L14 52 Z" fill="#7c6cff" ${L}/><ellipse cx="32" cy="34" rx="12" ry="13" fill="#ffd36e"/>${face(32, 34, .85)}`) },
  nuts: { label: "Nuts", svg: S(`<path d="M32 10 Q48 10 50 28 Q52 48 32 56 Q12 48 14 28 Q16 10 32 10 Z" fill="#c98a5a" ${L}/><path d="M22 20 Q32 16 42 20 M20 30 Q32 26 44 30" stroke="#a5683e" stroke-width="2" fill="none" stroke-linecap="round"/>${face(32, 38, .85)}`) },
  bar: { label: "Snack bar", svg: S(`<rect x="6" y="22" width="52" height="22" rx="5" fill="#7c6cff" ${L}/><rect x="16" y="22" width="32" height="22" fill="#ffd36e"/><path d="M6 26 L2 24 M6 40 L2 42 M58 26 L62 24 M58 40 L62 42" ${L}/>${face(32, 32, .8)}`) },
  water: { label: "Drink", svg: S(`<path d="M16 12 H48 L44 56 H20 Z" fill="#fff" ${L}/><path d="M18 26 H46 L44 54 H20 Z" fill="#8fd0ff"/>${face(32, 40, .85)}`) },
};

export const ICON_KEYS = Object.keys(FOOD_ICONS);

// Backup when the AI didn't pick one: match words in the meal's name (English and Bulgarian).
const WORDS = [
  ["pizza", /pizz|пица/i], ["burger", /burger|бургер|hamburg/i], ["sandwich", /sandwich|wrap|сандвич|дюнер|doner|döner|kebab|кебап|тост с/i],
  ["sushi", /sushi|суши|maki|roll/i], ["salad", /salad|салат/i], ["soup", /soup|супа|чорба|broth|bouillon/i],
  ["pasta", /pasta|spaghett|noodle|lasagn|макарон|спагети|паста|лазаня|ramen/i], ["rice", /rice|ориз|risotto|пилаф|curry|кари/i],
  ["egg", /egg|яйц|omelet|омлет|scrambl/i], ["toast", /toast|bread|хляб|филия|bagel|croissant|кроасан|баница|pastry|тестен|бутер/i],
  ["oats", /oat|овес|cereal|granola|мюсли|muesli|porridge|каша|качамак|polenta|pancake|палачинк|waffle/i],
  ["chicken", /chicken|пиле|пилешк|wing|nugget|turkey|пуйк/i], ["meat", /meat|beef|pork|steak|месо|свинск|телешк|кайма|кюфте|кебапче|sausage|наденица|bacon|бекон|ham|шунка|салам/i],
  ["fish", /fish|риба|salmon|сьомга|tuna|тон|shrimp|скарид/i], ["banana", /banana|банан/i],
  ["apple", /apple|ябълк|fruit|плод|berry|ягод|orange|портокал|grape|грозд|pear|круш|melon|пъпеш|диня|kiwi|peach|праскова|mango|mousse|пюре/i],
  ["veggies", /veg|зеленчу|carrot|морков|tomato|домат|cucumber|красавиц|broccoli|potato|картоф|beans|боб/i],
  ["cheese", /cheese|сирене|кашкавал|cheddar|mozzarell|brie|parmesan/i], ["yogurt", /yog|кисело мляко|йогурт|kefir|айрян|skyr|cottage|извара/i],
  ["icecream", /ice ?cream|сладолед|gelato/i], ["cupcake", /cupcake|muffin|мъфин|кексче|dessert|десерт|сладкиш|pudding|пудинг|eclair|еклер|donut|поничк|brownie/i], ["cake", /cake|торта|кекс|pie|tiramisu|cheesecake|baklava|баклав/i],
  ["cookie", /cookie|бисквит|biscuit|курабийк|бисквитк/i], ["chocolate", /chocolat|шоколад|candy|бонбон|sweet/i],
  ["chips", /chips|чипс|crisps|popcorn|пуканк|cracker|крекер|солет/i], ["nuts", /nut|ядк|орех|almond|бадем|фъстъ|cashew|кашу|seed|семк/i],
  ["bar", /bar\b|бар\b|протеинов|granola bar|снакс/i],
  ["wine", /wine|вино|champagne|prosecco|cocktail|коктейл|rakia|ракия|vodka|водка|whisk/i], ["beer", /beer|бира/i],
  ["coffee", /coffee|кафе|latte|лате|cappuccin|капучино|espresso|tea\b|чай|cocoa|какао/i],
  ["smoothie", /smoothie|смути|shake|шейк|milk|мляко/i], ["juice", /juice|сок|soda|cola|кола|lemonade|лимонада|fanta|sprite/i],
  ["water", /water|вода/i],
];
export function guessIcon(meal) {
  if (meal?.icon && FOOD_ICONS[meal.icon]) return meal.icon;
  const text = [meal?.name, ...(meal?.items || []).map((i) => i.name)].filter(Boolean).join(" ");
  for (const [key, re] of WORDS) if (re.test(text)) return key;
  return "plate";
}
export const foodIcon = (meal) => FOOD_ICONS[guessIcon(meal)].svg;
