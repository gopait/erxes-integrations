import {
  ConversationMessages as CallProConversationMessages,
  Conversations as CallProConversations,
  Customers as CallProCustomers,
} from './callpro/models';
import { debugCallPro, debugFacebook, debugGmail, debugNylas } from './debuggers';
import {
  Comments as FacebookComments,
  ConversationMessages as FacebookConversationMessages,
  Conversations as FacebookConversations,
  Customers as FacebookCustomers,
  Posts as FacebookPosts,
} from './facebook/models';
import { getPageAccessToken, unsubscribePage } from './facebook/utils';
import {
  ConversationMessages as GmailConversationMessages,
  Conversations as GmailConversations,
  Customers as GmailCustomers,
} from './gmail/models';
import { getCredentialsByEmailAccountId } from './gmail/util';
import { stopPushNotification } from './gmail/watch';
import { Accounts, Integrations } from './models';
import { enableOrDisableAccount } from './nylas/auth';
import { NylasGmailConversationMessages, NylasGmailConversations, NylasGmailCustomers } from './nylas/models';

/**
 * Remove integration by integrationId(erxesApiId) or accountId
 */
export const removeIntegration = async (id: string) => {
  const integration = await Integrations.findOne({
    $or: [{ erxesApiId: id }, { accountId: id }],
  });

  if (!integration) {
    throw new Error('Integration not found');
  }

  const { kind, _id, accountId } = integration;
  const account = await Accounts.findOne({ _id: accountId });

  const selector = { integrationId: _id };

  if (kind.includes('facebook') && account) {
    debugFacebook('Removing facebook entries');

    for (const pageId of integration.facebookPageIds) {
      const pageTokenResponse = await getPageAccessToken(pageId, account.token);

      await FacebookPosts.deleteMany({ recipientId: pageId });
      await FacebookComments.deleteMany({ recipientId: pageId });

      await unsubscribePage(pageId, pageTokenResponse);
    }

    const conversationIds = await FacebookConversations.find(selector).distinct('_id');

    await Integrations.deleteOne({
      $or: [{ erxesApiId: id }, { accountId: id }],
    });

    await FacebookCustomers.deleteMany({ integrationId: id });
    await FacebookConversations.deleteMany(selector);
    await FacebookConversationMessages.deleteMany({ conversationId: { $in: conversationIds } });
  }

  if (kind === 'gmail' && !account.nylasToken) {
    debugGmail('Removing gmail entries');

    const credentials = await getCredentialsByEmailAccountId({ email: account.uid });
    const conversationIds = await GmailConversations.find(selector).distinct('_id');

    await stopPushNotification(account.uid, credentials);

    await GmailCustomers.deleteMany(selector);
    await GmailConversations.deleteMany(selector);
    await GmailConversationMessages.deleteMany({ conversationId: { $in: conversationIds } });
  }

  if (kind === 'gmail' && account.nylasToken) {
    debugNylas('Removing nylas entries');

    const conversationIds = await NylasGmailConversations.find(selector).distinct('_id');

    await NylasGmailCustomers.deleteMany(selector);
    await NylasGmailConversations.deleteMany(selector);
    await NylasGmailConversationMessages.deleteMany({ conversationId: { $in: conversationIds } });

    // Cancel nylas subscription
    await enableOrDisableAccount(account.uid, false);
  }

  if (kind === 'callpro') {
    debugCallPro('Removing callpro entries');

    const conversationIds = await CallProConversations.find(selector).distinct('_id');

    await CallProCustomers.deleteMany(selector);
    await CallProConversations.deleteMany(selector);
    await CallProConversationMessages.deleteMany({ conversationId: { $in: conversationIds } });
  }

  return Integrations.deleteOne({ _id });
};
