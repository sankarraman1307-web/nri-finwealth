// Guide pages for nrifinwealth.com. Edit text here, then run: node scripts/build-guides.mjs
// Rules for this file:
//  - Only facts with a source in "sources". Anything unconfirmed goes in a "check" box.
//  - {{g:slug}} turns into a link path to another guide.
export const SITE = 'https://nrifinwealth.com';
export const CHECKED = '31 October 2026';
export const CHECKED_ISO = '2026-10-31';

const T18 = 'https://inview.nl/openCitation/idbb00844dab79e8d2009c29e59afb9d68/convention-between-the-kingdom-of-the-netherlands-and-the-republic-of-india-for-the-avoidance-of-double-taxation-and-the-prevention-of-fiscal-evasion-with-respect-to-taxes-on-income-and-on-capital-artikel-18';
const T23 = 'https://inview.nl/openCitation/id88497740b663c87e733ae35732018efe/convention-between-the-kingdom-of-the-netherlands-and-the-republic-of-india-for-the-avoidance-of-double-taxation-and-the-prevention-of-fiscal-evasion-with-respect-to-taxes-on-income-and-on-capital-regkop';

const S = {
  svbBuild: ['SVB: Building up an AOW pension', 'https://www.svb.nl/en/aow-pension/what-is-aow/building-up-an-aow-pension'],
  aowAge: ['Netherlands Worldwide: AOW pension age', 'https://www.nederlandwereldwijd.nl/aow-buiten-nederland/aow-leeftijd'],
  aowAbroad: ['Netherlands Worldwide: Will I receive an AOW pension if I live outside the Netherlands?', 'https://netherlandsworldwide.nl/aow-pension-abroad/receive'],
  aowVol: ['Netherlands Worldwide: Voluntary AOW insurance', 'https://www.netherlandsworldwide.nl/aow-pension-abroad/voluntary-insurance'],
  bdPension: ['Belastingdienst: Can I take my Dutch pension when I emigrate?', 'https://www.belastingdienst.nl/wps/wcm/connect/en/individuals/content/i-have-built-up-a-pension-in-the-netherlands-can-i-take-my-pension-to-another-country'],
  pgb: ['Pensioenfonds PGB: Commuting your pension', 'https://www.pensioenfondspgb.nl/en/participants/My-situation-changes/buying-off-pension/'],
  stipp: ['StiPP: You have moved abroad', 'https://www.stippensioen.nl/werknemer/english/your-stipp-pension/leaving-stipp/you-have-moved-abroad/'],
  t18: ['Netherlands-India tax treaty, Article 18 (pensions)', T18],
  t23: ['Netherlands-India tax treaty, Article 23 (relief from double tax)', T23],
  ruling: ['business.gov.nl: 30 percent ruling compensation down to 27 percent', 'https://business.gov.nl/amendment/30-percent-ruling-compensation-down-to-27-percent/'],
  box3: ['SRA: Box 3 percentages, exemptions and amounts 2026', 'https://www.sra.nl/nieuws/259001/2026/01/box-3-percentages-vrijstellingen-en-bedragen-2026'],
  box3assets: ['Belastingdienst: Assets and debts in box 3 (2026)', 'https://www.belastingdienst.nl/wps/wcm/connect/fisin/fisin2026/bezittingen_en_schulden_box_3_'],
  residency: ['ClearTax: How change in residential status affects income tax liability (secondary source)', 'https://cleartax.in/s/how-change-in-residential-status-affects-the-income-tax-liability'],
  inhTable: ['Belastingdienst: Fiscal figures for inheritance and gift tax 2026 (draft version of 20 Oct 2025)', 'https://odb.belastingdienst.nl/wp-content/uploads/2025/10/Fiscale-jaargegevens-Erfbelasting-en-Schenkbelasting-2026-20-10-2025-Conceptversie.pdf'],
  sraGift: ['SRA: What can you give tax-free in 2026?', 'https://www.sra.nl/nieuws/259001/2026/01/wat-mag-u-in-2026-belastingvrij-schenken'],
  cleartaxInh: ['ClearTax: Tax on inheritance in India (secondary source)', 'https://cleartax.in/s/inheritance-tax'],
};
const src = (...k) => k.map((x) => S[x]);

export const PAGES = [
{
slug: 'retire-in-india-from-the-netherlands',
title: 'Can I retire in India after living in the Netherlands?',
short: 'Retire in India from the Netherlands',
description: 'What decides whether you can retire in India after years in the Netherlands: Dutch State Pension (AOW), workplace pensions, tax, and how many months you spend where.',
answer: 'Often yes, but four things decide it: your Dutch State Pension (AOW) and workplace pensions, how Indian and Dutch tax treat your money, how many months a year you really spend in India, and what your savings earn. This guide shows where to look. The free planner turns it into a yes or no for your own numbers.',
sections: [
['The four things that decide it', `
<p><b>1. Your pensions.</b> The Dutch State Pension (called AOW) and your employer pension are paid to you abroad, but they do not start before your pension age and you cannot normally take them out early. See <a href="{{g:state-pension-and-workplace-pension-abroad}}">your Dutch pensions if you move to India</a>.</p>
<p><b>2. Tax.</b> Two countries may want a share. The Netherlands taxes your assets in Box 3 while you live there, including Indian bank accounts and property (<a href="{{g:indian-assets-box-3}}">Indian assets in Box 3</a>). India taxes you depending on your Indian tax status (<a href="{{g:indian-tax-residency-nri}}">NRI, RNOR or resident</a>).</p>
<p><b>3. Where you spend your months.</b> Spending half the year in each country is a popular plan. It is also the case where tax residency becomes hardest to judge.</p>
<p><b>4. How much you need.</b> Monthly spending in India is lower for most people, but not for everyone, and inflation in India differs from the Netherlands. See <a href="{{g:how-much-do-i-need-to-retire}}">how much do I need?</a></p>`],
['What the planner checks for you', `
<p>The planner compares three plans side by side: retire in the Netherlands, retire in India, or split the year (Both). For each it runs hundreds of possible futures with different investment returns and tells you in how many your money lasts to your chosen age.</p>
<p><b>Honest limit today:</b> Indian income tax is not yet modelled in full, so India and Both look better than they really are. We are adding it step by step, and we will say so on this page when it is done.</p>`],
['A short checklist before you decide', `
<ul>
<li>Ask <a href="https://www.mijnpensioenoverzicht.nl" rel="noopener">mijnpensioenoverzicht.nl</a> what pensions you have built up in the Netherlands and from which age they are paid.</li>
<li>Check how many years of State Pension you have built up. Each year counts for 2% (details in the next guide).</li>
<li>List your Indian assets: NRO and NRE accounts, shares and funds, property, any Indian pension.</li>
<li>Decide how many months a year you will really spend in India. Write the number down.</li>
<li>Run the planner with a cautious return, then with a lower one.</li>
</ul>`],
],
check: ['Your own case', 'This guide is general information. Your nationality, your Indian tax status and the exact year you move can change the answer. Check the final plan with a qualified cross-border adviser.'],
faq: [
['Can I get my Dutch pension in India?', 'Yes for the pension you have built up, but when it starts and how much it is depends on your State Pension build-up and on your workplace pension scheme. Check with the SVB (State Pension) and your pension fund (workplace pension).'],
['Is it cheaper to live in India?', 'For many people monthly spending is lower, but it depends on city, lifestyle and healthcare. Enter your own monthly cost in the planner rather than relying on a general rule.'],
],
sources: src('svbBuild', 'aowAbroad', 'box3assets'),
related: ['state-pension-and-workplace-pension-abroad', 'indian-tax-residency-nri', 'how-much-do-i-need-to-retire', 'indian-assets-box-3'],
},

{
slug: 'state-pension-and-workplace-pension-abroad',
title: 'Dutch State Pension (AOW) and workplace pensions if you move to India',
short: 'Your Dutch pensions if you move abroad',
description: 'What happens to your Dutch State Pension (AOW), employer pension and private pension when you leave the Netherlands, and whether you can take a lump sum instead of waiting.',
answer: 'You keep what you have built up, but you cannot normally cash it out early. The Dutch State Pension (AOW) is paid from the pension age (67 for 2026 and 2027, 67 years and 3 months from 2028). Your employer pension stays with the fund and is paid at its own retirement age. Leaving the Netherlands does not unlock either one.',
sections: [
['Three Dutch pensions, side by side', `
<table>
<tr><th></th><th>Dutch State Pension (AOW)</th><th>Employer pension</th><th>Private pension or annuity</th></tr>
<tr><td>Who pays</td><td>SVB (government)</td><td>Your employer's pension fund or insurer</td><td>The bank or insurer where you saved</td></tr>
<tr><td>Starts at</td><td>67 for 2026 and 2027; 67 years 3 months for 2028 to 2031</td><td>Set by your scheme</td><td>As agreed in the contract</td></tr>
<tr><td>If you move abroad</td><td>What you built up stays. Years you are not insured cost 2% each.</td><td>Stays with the fund</td><td>Depends on the product</td></tr>
<tr><td>Cash out early?</td><td>No</td><td>Generally no (see below)</td><td>Ask your provider</td></tr>
</table>
<p>Not sure what you have? <a href="https://www.mijnpensioenoverzicht.nl" rel="noopener">mijnpensioenoverzicht.nl</a> lists your Dutch pensions in one place.</p>`],
['The Dutch State Pension (AOW)', `
<p>AOW is the Dutch state pension. Each year you are insured under the Dutch scheme earns you 2% of a full pension, over the 50 years before your pension age. A person with all 50 years gets the full amount. Each year you are not insured reduces it by 2%. Living or working abroad usually means you are no longer insured.</p>
<p><b>Example.</b> You lived in the Netherlands from age 30 to 55, which is 25 years, and nowhere else with Dutch insurance. You would build up about 50% of a full AOW (25 years at 2%).</p>
<p><b>Voluntary insurance.</b> If you leave, you may be able to keep building AOW by insuring voluntarily. You must have been insured at least one full year and apply before you leave or within one year after. It lasts up to 10 years in the standard case and it costs a percentage of your income each year. The SVB has a calculator.</p>
<p><b>Being paid abroad.</b> Whether the AOW is paid in a given country depends on that country: check the SVB page for India before you plan on it. If you live abroad, apply for AOW six months before you reach your pension age.</p>
<p><b>Our planner</b> assumes the State Pension starts at 68, a little later than the legal age, to stay on the cautious side.</p>`],
['Workplace pension: can I take a lump sum when I leave?', `
<p>This is one of the most common questions, and the short answer is no. Leaving the Netherlands does not unlock your employer pension. It stays with the fund and is paid from your pension age.</p>
<ul>
<li><b>Very small pensions.</b> A pension below a small limit (EUR 632.63 gross a year in 2026) may be paid out as one amount, but funds such as PGB say this is no longer possible when you leave an employer. They try to move it to your new pension provider instead. StiPP allows it only after five years without new pension saving, or within five years of AOW age.</li>
<li><b>Transfer to a pension abroad.</b> Possible only under conditions. Outside the EU, your fund must ask De Nederlandsche Bank (DNB) to approve it. For the transfer to stay tax free you need, among other things, at least 5 continuous years of work outside the Netherlands and a foreign scheme that agrees to take it. A transfer into an Indian scheme should not be assumed.</li>
<li><b>New pension system.</b> Dutch funds are moving to a new pension system, and some transfers were paused in the first half of 2026.</li>
</ul>`],
['Which country taxes your pension?', `
<p>The Netherlands-India tax treaty (Article 18) says pensions and annuities from past employment are taxable only in the country where you live, while social-security pensions may be taxed by the country that pays them. Government pensions have their own rule (Article 19). The treaty also has a rule to avoid taxing the same income twice (Article 23).</p>
<p>How this applies to AOW, to your workplace pension, and to the paperwork needed so that your Dutch fund pays without withholding tax: ask an adviser before you leave.</p>`],
],
check: ['To confirm with your fund and an adviser', 'The general rule that employer pensions cannot be cashed out when you emigrate is widely applied, but the sources above state the exceptions rather than the rule itself. Ask your pension fund in writing. Also confirm with an adviser how AOW and your workplace pension are taxed once you live in India.'],
faq: [
['What does AOW mean?', 'AOW stands for Algemene Ouderdomswet, the Dutch State Pension. It is paid by the SVB to people who have lived or worked in the Netherlands, from the pension age.'],
['Can I take my Dutch employer pension as a lump sum when I leave the Netherlands?', 'In general no. A small pension below a limit (EUR 632.63 a year in 2026) can sometimes be paid out, and transfers abroad need approval. Check your own fund.'],
['Do I lose my Dutch pension if I move to India?', 'No. What you have built up stays yours and is paid from your pension age. What changes is that you stop building up new State Pension unless you insure voluntarily.'],
],
sources: src('svbBuild', 'aowAge', 'aowAbroad', 'aowVol', 'bdPension', 'pgb', 'stipp', 't18', 't23'),
related: ['retire-in-india-from-the-netherlands', 'indian-tax-residency-nri', 'how-much-do-i-need-to-retire'],
},

{
slug: '30-percent-ruling-ending',
title: 'The 30% ruling is ending or dropping to 27%: what it means for your retirement',
short: '30% ruling ending',
description: 'The Dutch 30% ruling lasts 5 years and drops to 27% from 2027 for newer cases. How it changes your take-home pay, saving and retirement plan.',
answer: 'The 30% ruling lets your employer pay up to 30% of your salary tax free for a maximum of 5 years. If you started before 1 January 2024, the 30% continues for your 5 years. If you started after that date, it is 30% until the end of 2026 and 27% from 2027. When it ends, your take-home pay drops, so the amount you can save for retirement changes.',
sections: [
['The rule in one table', `
<table>
<tr><th>When you started the ruling</th><th>Tax-free share</th></tr>
<tr><td>Before 1 January 2024</td><td>30% for the whole 5 years</td></tr>
<tr><td>After 1 January 2024</td><td>30% in 2024, 2025 and 2026, then 27% from 1 January 2027</td></tr>
</table>
<p>From 2027 the minimum salary needed to start is EUR 50,436 (EUR 46,107 for older cases, adjusted each year). Employees under 30 with a master's degree have a lower limit.</p>`],
['Why this matters for retirement planning', `
<ul>
<li><b>Your savings rate falls.</b> If you plan to save from your take-home pay, the planner's "monthly savings" should be the number after the ruling ends, not before.</li>
<li><b>The ruling is temporary.</b> Many people plan their whole retirement savings on a salary that exists for only 5 years.</li>
<li><b>Your timeline.</b> If you plan to leave the Netherlands around the time the ruling ends, the ruling's years may be your last years of saving at this level.</li>
</ul>
<p><b>Example.</b> When the tax-free share drops from 30% to 27%, three percentage points of your salary become taxable. On a salary of EUR 100,000 that is EUR 3,000 a year more that is taxed at your top rate. When the ruling ends completely, the whole tax-free share goes.</p>
<p>If you enter your 30% ruling in the planner, it shows what the ruling is worth to your household, when your take-home pay drops, and what investing the extra pay could grow to.</p>`],
],
check: ['Your own start date', 'The exact treatment depends on when your ruling started and on your employment details. Check with your employer or the Belastingdienst or RVO for your own case.'],
faq: [
['How long does the 30% ruling last?', 'A maximum of 5 years.'],
['Is the 30% ruling really changing to 27%?', 'Yes. According to business.gov.nl, for rulings that start after 1 January 2024 the tax-free share becomes 27% from 1 January 2027.'],
],
sources: src('ruling'),
related: ['how-much-do-i-need-to-retire', 'indian-assets-box-3', 'retire-in-india-from-the-netherlands'],
},

{
slug: 'indian-assets-box-3',
title: 'Are my Indian assets taxed in Dutch Box 3?',
short: 'Indian assets in Box 3',
description: 'If you live in the Netherlands, your Indian bank accounts, shares, funds and property count in Box 3. How the 2026 rates work, with an example.',
answer: 'Yes. While you live in the Netherlands, Box 3 covers your assets wherever they are, including Indian bank accounts and property. After you move away and no longer live in the Netherlands, you declare only your Dutch assets. Indian tax on the same assets can come on top.',
sections: [
['What the Belastingdienst says', `
<p>The Belastingdienst says you must declare assets in the Netherlands or abroad. Foreign bank accounts count as bank accounts. A second home counts whether it is in the Netherlands or abroad. Shares count without regard to country. If you live outside the Netherlands, you declare only your Dutch assets, for example a second home in the Netherlands.</p>`],
['How Box 3 works in 2026', `
<ul>
<li>Tax-free allowance: EUR 59,357 per person (EUR 118,714 for fiscal partners).</li>
<li>Assumed return: 1.28% on bank and savings (provisional), 6.00% on other assets such as shares, funds and bonds, and 2.70% on debts (provisional).</li>
<li>Tax rate: 36% of the assumed return.</li>
<li>Debts count only above EUR 3,800 per person.</li>
<li>If your actual return was lower than the assumed one, you can use the counter-evidence scheme in 2026.</li>
</ul>`],
['Example', `
<p>You are single and own EUR 100,000 in Indian deposits and EUR 100,000 in Indian mutual funds, with no debts.</p>
<ul>
<li>Assumed return: 100,000 x 1.28% + 100,000 x 6.00% = EUR 1,280 + EUR 6,000 = EUR 7,280.</li>
<li>Taxable share: (200,000 - 59,357) / 200,000 = 70.3%.</li>
<li>Taxable return: 7,280 x 70.3% = about EUR 5,119.</li>
<li>Tax at 36%: about EUR 1,843 a year.</li>
</ul>
<p>This is a simplified example. It ignores debts, exchange rate moves and special allowances. It is the Dutch tax only: India may also tax interest, rent or gains from the same assets.</p>`],
['Two taxes on one asset', `
<p>India taxes Indian income (interest, rent, gains) even when you live abroad, and the Netherlands taxes the same assets through Box 3. The treaty's Article 23 is meant to avoid taxing the same income twice. Whether and how it gives relief against Box 3, which taxes an assumed return rather than your actual income, is a question for an adviser. The planner does not assume any relief by default.</p>`],
],
check: ['To confirm with an adviser', 'Whether and how Indian tax can be offset against Box 3, and how particular products (NRE and NRO accounts, mutual funds) are treated. Box 3 rules are also due to change, so rates after 2026 may differ.'],
faq: [
['Do I have to declare my NRE and NRO accounts in the Netherlands?', 'Foreign bank accounts count as box 3 assets while you live in the Netherlands. Declare them in your Dutch tax return.'],
['Do I still pay Box 3 after I move to India?', 'If you live outside the Netherlands, you declare only your Dutch assets, according to the Belastingdienst.'],
],
sources: src('box3', 'box3assets', 't23'),
related: ['indian-tax-residency-nri', 'retire-in-india-from-the-netherlands', 'inheritance-tax-netherlands-india-assets'],
},

{
slug: 'indian-tax-residency-nri',
title: 'NRI, RNOR or resident? Indian tax status if you split your year',
short: 'Indian tax residency (NRI, RNOR)',
description: 'The Indian day-count tests (182 days, 120 days, 15 lakh) that decide if you are an NRI, RNOR or resident, and why they matter if you split the year.',
answer: 'India decides your tax status by counting days in the Indian financial year (1 April to 31 March). Under 182 days usually keeps you a non-resident (NRI). For some Indian citizens with higher Indian income there is a stricter test. A status in between, RNOR, is a temporary middle level. Your status decides which of your income India taxes.',
sections: [
['Three statuses', `
<table>
<tr><th>Status</th><th>What India taxes</th></tr>
<tr><td>NRI (non-resident)</td><td>Income earned or received in India</td></tr>
<tr><td>RNOR (resident but not ordinarily resident)</td><td>Income earned or received in India (plus some income controlled from India)</td></tr>
<tr><td>Resident and ordinarily resident</td><td>Your income from anywhere in the world</td></tr>
</table>`],
['The day counts (secondary sources)', `
<ul>
<li>You are generally a resident if you are in India 182 days or more in the financial year, or a shorter stay plus a long stay in the previous four years.</li>
<li>For an Indian citizen or person of Indian origin with Indian income above 15 lakh a year, the stricter threshold is 120 days, and the person then becomes resident but not ordinarily resident.</li>
<li>A returning person is RNOR if they were an NRI in 9 of the previous 10 years, or spent 729 days or fewer in India in the previous 7 years.</li>
</ul>`],
['Why this matters if you split your year', `
<p>If you plan to spend 6 months in India and 6 months in the Netherlands, you sit right at the line. The planner warns you when your months in India approach the limits. At 6 months or more it says the result is not reliable, because status, taxes and the treaty tie-breaker can all change the answer.</p>
<p>Your Dutch tax residency is a separate question. The Netherlands generally looks at where your life is centred, such as your home and family, rather than at a day count. Confirm your own position with an adviser.</p>`],
],
check: ['We have not yet checked the official text', 'The day counts above come from secondary sources and our reading of the rules, not from the official Income-tax Act text. Details such as how the 120-day test applies, the deemed residency rule and the 2025 Act renumbering need confirmation by an Indian tax adviser. Do not rely on this page for a residency decision.'],
faq: [
['How many days can an NRI stay in India?', 'Under 182 days in the financial year is the general limit. A stricter limit applies in some cases for citizens with higher Indian income. Get advice for your own case.'],
['What is RNOR?', 'Resident but not ordinarily resident: a temporary status between NRI and fully resident, where India taxes only Indian income.'],
],
sources: src('residency', 't23'),
related: ['indian-assets-box-3', 'retire-in-india-from-the-netherlands', 'state-pension-and-workplace-pension-abroad'],
},

{
slug: 'how-much-do-i-need-to-retire',
title: 'How much money do I need to retire in the Netherlands, India or both?',
short: 'How much do I need to retire?',
description: 'A simple way to estimate the savings you need for retirement, using the gap between spending and pensions, with an example and the limits of rules of thumb.',
answer: 'Start with the yearly gap: what you spend minus the pensions you will receive. Divide the gap by a safe withdrawal rate such as 3.5% to get a first estimate of the pot you need. It is a rule of thumb. A planner that simulates many possible futures is more reliable, because it also looks at returns, inflation and tax.',
sections: [
['The quick estimate', `
<ol>
<li>Write down your yearly spending in today's euros.</li>
<li>Subtract the pensions you will receive each year (Dutch State Pension, workplace pension, Indian pension).</li>
<li>Divide the gap by 0.035 (3.5%).</li>
</ol>
<p><b>Example.</b> You want EUR 36,000 a year. Pensions give EUR 12,000 a year. The gap is EUR 24,000. The first estimate is 24,000 / 0.035 = about EUR 686,000.</p>`],
['Why a rule of thumb is not enough', `
<ul>
<li>Pensions start at different ages, so the gap changes over time.</li>
<li>Returns are uneven. A bad first five years hurts more than a bad last five.</li>
<li>Tax differs between the Netherlands and India, and Box 3 taxes the pot every year.</li>
<li>Where you live changes your monthly cost.</li>
</ul>`],
['How the planner defines "needed"', `
<p>The planner shows the smallest pot that lasts to your chosen age if returns come in at the average. It then also shows how often your actual pot survives across many random futures. If you choose to leave an inheritance, it looks for a pot that still holds that amount at the end, and the safe payout rate (3.5% by default, changeable under Assumptions) applies to that case.</p>`],
],
check: ['Rules of thumb', 'The 3.5% rate is the planner default, not a guarantee. Lower it for a longer retirement or a more cautious view.'],
faq: [
['What is a safe withdrawal rate?', 'The share of your pot you take out in the first year, adjusted for inflation afterwards. 3.5% is the planner default. You can change it.'],
['How much do I need to retire in India?', 'It depends on your spending in India, your pensions and your tax status. Enter your own numbers in the planner.'],
],
sources: src('aowAge', 'box3'),
related: ['retire-in-india-from-the-netherlands', 'state-pension-and-workplace-pension-abroad', 'indian-assets-box-3'],
},

{
slug: 'inheritance-tax-netherlands-india-assets',
title: 'How is inheritance taxed if I live in the Netherlands and own assets in India?',
short: 'Inheritance with Indian assets',
description: 'How Dutch inheritance tax works for your children, with 2026 draft rates and exemptions, and what is known about inheritance in India.',
answer: 'Dutch inheritance tax follows where the person who dies lived, and covers their assets worldwide. For children the rate is 10% up to EUR 158,669 and 20% above, after an exemption of EUR 26,230 per child. India has no inheritance or estate tax according to secondary sources, but there is paperwork. Both are subject to confirmation.',
sections: [
['Dutch rates and exemptions (2026, draft figures)', `
<table>
<tr><th>Heir</th><th>Exemption</th><th>Rates</th></tr>
<tr><td>Partner</td><td>EUR 828,035</td><td>10% up to EUR 158,669, then 20%</td></tr>
<tr><td>Child</td><td>EUR 26,230</td><td>10% up to EUR 158,669, then 20%</td></tr>
<tr><td>Grandchild</td><td>EUR 26,230</td><td>18% / 36%</td></tr>
<tr><td>Child with disability</td><td>EUR 78,671</td><td>10% / 20%</td></tr>
</table>
<p>These are from the Belastingdienst draft table for 2026. Check the final table before acting.</p>`],
['Example', `
<p>A parent who lived in the Netherlands leaves EUR 2,000,000 to two children, so EUR 1,000,000 each.</p>
<ul>
<li>Taxable per child: 1,000,000 - 26,230 = EUR 973,770.</li>
<li>Tax: 10% of 158,669 = EUR 15,867, plus 20% of 815,101 = EUR 163,020. Total EUR 178,887 per child.</li>
<li>For both children about EUR 357,800, around 18% of the estate.</li>
</ul>
<p>The planner's "An inheritance" option does not yet deduct Dutch inheritance tax. Today it shows what is left before this tax.</p>`],
['India', `
<p>According to a secondary source, India has no inheritance or estate tax and receiving property by will or inheritance is not taxed. Income from the inherited property is taxed in the heir's hands, and on a later sale the heir takes the previous owner's cost and holding period.</p>`],
['Ways to reduce the tax', `
<p>Giving to your children while you are alive, within the exemptions, reduces what is left to tax. See <a href="{{g:giving-to-children-while-alive}}">giving to children while alive</a>.</p>`],
],
check: ['Not yet confirmed', 'Whether your nationality changes the position after you leave the Netherlands, Indian wills and probate, moving inherited money out of India, and relief for foreign tax. These are for a cross-border adviser. We have left them out on purpose.'],
faq: [
['Does India have inheritance tax?', 'According to the secondary source we checked, no. Estate duty was abolished in 1985.'],
['Which country taxes my inheritance?', 'Dutch inheritance tax follows where the person who dies lived. Check how nationality and moving away change this.'],
],
sources: src('inhTable', 'cleartaxInh'),
related: ['giving-to-children-while-alive', 'indian-assets-box-3', 'retire-in-india-from-the-netherlands'],
},

{
slug: 'giving-to-children-while-alive',
title: 'Giving to your children while you are alive: Dutch gift tax exemptions for 2026',
short: 'Giving to children while alive',
description: 'The 2026 Dutch tax-free gift amounts: EUR 6,908 a year, EUR 33,129 once, and EUR 69,009 once for an expensive study, with the conditions.',
answer: 'In 2026 you can give each child EUR 6,908 tax free in a year. Once per child, a larger one-off amount of EUR 33,129 applies for a child aged 18 up to 40, or EUR 69,009 if the money goes to an expensive study. Only one of the one-off amounts can be used. These figures are from SRA for 2026.',
sections: [
['The amounts', `
<table>
<tr><th>Gift</th><th>Tax-free amount in 2026</th></tr>
<tr><td>Annual, per child</td><td>EUR 6,908</td></tr>
<tr><td>One-off, child aged 18 up to 40</td><td>EUR 33,129</td></tr>
<tr><td>One-off for an expensive study</td><td>EUR 69,009 in total (not on top of the 33,129)</td></tr>
<tr><td>Other recipients (for example grandchildren)</td><td>EUR 2,769</td></tr>
</table>`],
['The conditions', `
<ul>
<li>You can use only one of the one-off exemptions, once per child.</li>
<li>In the year you use a one-off exemption, you cannot also use the annual EUR 6,908.</li>
<li>Study gift: the part above EUR 33,129 must be spent on the study. SRA lists conditions such as study costs of at least EUR 20,000 a year, a notarial deed, and being able to show how the money was used.</li>
<li>The one-off exemption for buying a home no longer exists in 2026.</li>
</ul>`],
['Example', `
<p>Two children aged 22 and 25. This year you give each EUR 33,129 using the one-off exemption: EUR 66,258 leaves your estate tax free. Later years: EUR 6,908 per child per year, no condition.</p>`],
],
check: ['To confirm', 'How the amounts apply when both parents give, the exact timing rules for gifts, and the study conditions (another source describes them less fully than SRA). Check with the Belastingdienst or an adviser before you rely on the study gift.'],
faq: [
['How much can I give my child tax free in the Netherlands?', 'EUR 6,908 a year in 2026, or once a higher amount of EUR 33,129 for a child aged 18 up to 40.'],
['Is there a higher tax-free gift for study?', 'Yes: EUR 69,009 in total in 2026, but the part above EUR 33,129 must be spent on the study, with conditions.'],
],
sources: src('sraGift', 'inhTable'),
related: ['inheritance-tax-netherlands-india-assets', 'indian-assets-box-3', 'how-much-do-i-need-to-retire'],
},
];

// Extra fields per page: topic label, three-line summary, and the planner banner shown in the middle of the page.
export const EXTRA = {
  'retire-in-india-from-the-netherlands': { kicker: 'Guide · The big picture', take: ['Four things decide it: pensions, tax, months in India, and how much you need.', 'Your Dutch pensions are paid abroad, but not early.', 'The planner turns this into a yes or no for your numbers.'], cta: ['See if India works for you', 'Compare the Netherlands, India and a split year with your own numbers. Free, about 2 minutes, no sign-up.'] },
  'state-pension-and-workplace-pension-abroad': { kicker: 'Guide · Pensions', take: ['You keep what you have built up.', 'You cannot normally cash it out early.', 'Leaving the Netherlands does not unlock it.'], cta: ['See what your pensions are worth in India', 'Enter your State Pension and employer pension and see in how many futures your money lasts. Free, about 2 minutes, no sign-up.'] },
  '30-percent-ruling-ending': { kicker: 'Guide · Tax', take: ['The ruling lasts at most 5 years.', 'For rulings started after 1 January 2024 it drops from 30% to 27% in 2027.', 'Plan your savings on the pay after the ruling.'], cta: ['See what your ruling is worth', 'Enter your ruling and see when your take-home pay drops and what investing the extra could grow to.'] },
  'indian-assets-box-3': { kicker: 'Guide · Tax', take: ['Box 3 covers your Indian accounts, funds and property while you live in the Netherlands.', 'After you move away, you declare only Dutch assets.', 'India may tax the same assets again.'], cta: ['See how Box 3 affects your plan', 'The planner includes Dutch Box 3 tax on your savings year by year. Try it with your numbers.'] },
  'indian-tax-residency-nri': { kicker: 'Guide · Tax status', take: ['India counts days in its financial year (1 April to 31 March).', 'NRI, RNOR and resident are taxed differently.', 'Splitting the year puts you near the line.'], cta: ['Test a split year', 'Choose "Both" and set your months in India to see the result and the warning the planner gives.'] },
  'how-much-do-i-need-to-retire': { kicker: 'Guide · Planning', take: ['Gap between spending and pensions, divided by a safe payout rate.', 'Example: 24,000 a year gap at 3.5% is about 686,000.', 'A simulation is more reliable than a rule of thumb.'], cta: ['Find your own number', 'The planner shows the pot you need and how often it lasts across many possible futures.'] },
  'inheritance-tax-netherlands-india-assets': { kicker: 'Guide · Inheritance', take: ['Dutch inheritance tax follows where the person who dies lived.', 'Children pay 10% up to EUR 158,669 and 20% above, after EUR 26,230 each (draft 2026 figures).', 'India has no inheritance tax, according to a secondary source.'], cta: ['See what you could leave', 'Choose "An inheritance" in the planner to see what is left at your chosen age.'] },
  'giving-to-children-while-alive': { kicker: 'Guide · Gifts', take: ['EUR 6,908 a year per child tax free in 2026.', 'Once per child: EUR 33,129, or EUR 69,009 for an expensive study.', 'Only one one-off exemption can be used.'], cta: ['Plan around your gifts', 'See how much you can pass on while keeping your own retirement safe.'] },
};
