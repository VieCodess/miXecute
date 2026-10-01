import {NativeModules, Platform} from 'react-native';

const LINKING =
  'XecuteRevenueCat native module is not linked. Rebuild the Android app.';

export type CustomerInfoSummary = {
  appUserId?: string;
  isPro: boolean;
  isFounder?: boolean;
  /** pro_monthly | pro_yearly | founder */
  planKind?: string;
  entitlementId: string;
  entitlementActive?: boolean;
  productIdentifier?: string | null;
  expirationDate?: number | null;
  willRenew?: boolean;
  activeSubscriptions?: string[];
  allPurchasedProductIds?: string[];
};

export type OfferingPackage = {
  identifier: string;
  packageType: string;
  productId: string;
  title: string;
  description: string;
  priceString: string;
  price: number;
  currencyCode: string;
  planKind?: string;
  displayLabel?: string;
};

export type OfferingsSummary = {
  currentOfferingId?: string;
  packages: OfferingPackage[];
  expectedPackageIds: string[];
};

export type PaywallPresentResult = {
  result: 'purchased' | 'restored' | 'cancelled' | 'not_presented' | string;
  isPro?: boolean;
  customerInfo?: CustomerInfoSummary;
};

type NativeRevenueCat = {
  getCustomerInfo(): Promise<CustomerInfoSummary>;
  hasProEntitlement(): Promise<boolean>;
  logIn(appUserId: string): Promise<CustomerInfoSummary>;
  logOut(): Promise<CustomerInfoSummary | null>;
  getOfferings(): Promise<OfferingsSummary>;
  purchasePackage(packageId: string): Promise<CustomerInfoSummary>;
  restorePurchases(): Promise<CustomerInfoSummary>;
  presentPaywall(): Promise<PaywallPresentResult>;
  presentPaywallIfNeeded(): Promise<PaywallPresentResult>;
  presentCustomerCenter(): Promise<boolean>;
};

const Native: NativeRevenueCat =
  Platform.OS === 'android' && NativeModules.XecuteRevenueCat
    ? NativeModules.XecuteRevenueCat
    : new Proxy({} as NativeRevenueCat, {
        get() {
          throw new Error(LINKING);
        },
      });

export const RevenueCat = {
  getCustomerInfo: () => Native.getCustomerInfo(),
  hasPro: () => Native.hasProEntitlement(),
  logIn: (appUserId: string) => Native.logIn(appUserId),
  logOut: () => Native.logOut(),
  getOfferings: () => Native.getOfferings(),
  purchasePackage: (packageId: 'monthly' | 'yearly' | 'lifetime' | string) =>
    Native.purchasePackage(packageId),
  restore: () => Native.restorePurchases(),
  presentPaywall: () => Native.presentPaywall(),
  presentPaywallIfNeeded: () => Native.presentPaywallIfNeeded(),
  presentCustomerCenter: () => Native.presentCustomerCenter(),
};
