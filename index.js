const fs = require('fs');

require('dotenv').config();
const superagent = require('superagent');
const { WebhookClient, EmbedBuilder } = require('discord.js');

// The Discord Webhook (for notifying of new PRs, etc)
const webhook = new WebhookClient({
    id: process.env.WEBHOOK_ID,
    token: process.env.WEBHOOK_TOKEN
});

/**
 * Array of reviewed PR objects.
 * @type {Array}
 */
let reviewedPRs = [];

/**
 * Try reading the JSON file for previously reviewed PRs.
 * If it ain't there, initialize an empty array.
 */
try {
    reviewedPRs = JSON.parse(fs.readFileSync('reviewedPRs.json'));
} catch (err) {
    console.error('Reviews list MIA. Starting empty.');
}

/**
 * Main function to check for PRs pending review.
 * If not in the reviewed list, add to it and update the JSON file.
 * Execute every minute.
 */
async function checkPRs() {
    // Get the Open PRs
    const { body: prData } = await superagent.get('https://api.github.com/repos/PIVX-Labs/MyPIVXWallet/pulls').set('User-Agent', 'Prodder');

    prData.forEach(async pull => {
        const labelExists = pull.labels.some(label => label.name === 'Awaiting Review');
        const alreadyReviewed = reviewedPRs.some(revPR => revPR.number === pull.number);
        // pull 'Review Reward:' labels
        const rewardLabel = pull.labels.find(l => l.name.startsWith('Review Reward:'))?.name;

        // remove label bits, convert to number or 0 if NaN
        const nReviewReward = rewardLabel ? Number(rewardLabel.replace(/.*?:\s*|\s*PIV/g, '')) || 0 : 0;

        // If the label exists, the PR is open and the PR ain't in the reviewed list, add it.
        if (labelExists && pull.state === 'open' && !alreadyReviewed) {
            console.log(`PR #${pull.number} needs reviewing.`);
            const { instructions, fullPull } = await getTestingInstructions(pull);

            // Notify the team to review the PR
            const embed = new EmbedBuilder()
                .setURL(pull.html_url)
                .setTitle('🚀 New Pull Request ready for Review! (#' + pull.number + ')')
                .setColor(0xA042FF)
                .setDescription(`### Title: ${pull.title}\n${instructions ? `### 💰 Testing Reward: __${nReviewReward} PIV__\n\n` + instructions : 'This Pull Request has no testing instructions, so Quality Control members may skip it.'}\n\n### 🔧 Developer(s) of this Pull Request:\n**${fullPull.assignees.map(a => a.login).join(', ')}**\n> For any reporting, suggestions or otherwise, contact the above developers of this Pull Request, happy Quality Controlin'!`);
            webhook.send({ content: instructions ? '<@&1092919854778044496>' : 'New PR!', embeds: [embed] });

            reviewedPRs.push({ number: pull.number });
            fs.writeFileSync('reviewedPRs.json', JSON.stringify(reviewedPRs));
        }
    });
};

/**
 * Function to fetch the 'Testing' segment from a PR's description.
 * @param {object} pull - GitHub PR object.
 */
async function getTestingInstructions(pull) {
    const { body: response } = await superagent.get(pull.url).set('User-Agent', 'Prodder');
    const re = /#+\s*Testing([\s\S]*?)(?=#+|--|$)/i;
    const match = re.exec(response.body);
    return { instructions: match ? match[1].trim() : '', fullPull: response };
}

// Execute the function every 10 minutes
setInterval(checkPRs, 10 * 60 * 1000);

// And at boot
checkPRs();