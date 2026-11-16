
/* eslint-disable */

  
    export type usersInp = {
      
      
    }


    export type usersSchema = {
_id?: string;
authProvider: string;
authSubject: string;
email?: string;
phone?: string;
displayName: string;
preferredLocale: ("en" | "fa" | "ar" );
roles: ("CONTRIBUTOR" | "RESEARCHER" | "LEGAL_REVIEWER" | "MODERATOR" | "ADMIN" )[];
trustLevel: number;
accountStatus: ("ACTIVE" | "SUSPENDED" | "CLOSED" );
lastActiveAt?: Date;
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
};
;


    export type brandsInp = {
      
      productsPreview?: number | productsInp
    }


    export type brandsSchema = {
_id?: string;
name: string;
normalizedName: string;
aliases?: {
value: string;
normalizedValue: string;
locale?: string;
}[];
website?: string;
logoAssetId?: string;
internalNotes?: {
body: string;
authorId: string;
createdAt: Date;
visibility: ("INTERNAL" | "LEGAL" | "ADMIN" );
}[];
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
productsPreview: {
_id?: string;
name: string;
normalizedName: string;
localizedNames?: {
locale: string;
value: string;
}[];
identifiers: {
scheme: string;
value: string;
normalizedValue: string;
jurisdiction?: string;
issuer?: string;
status: ("VERIFIED" | "UNVERIFIED" | "DISPUTED" | "RETIRED" );
sourceSnapshotIds?: string[];
validFrom?: Date;
validTo?: Date;
}[];
brandMapping: {
state: ("CONFIRMED" | "UNVERIFIED" | "CONFLICTING" | "NONE" );
summary?: string;
};
packaging?: {
format?: string;
quantity?: number;
unit?: string;
};
attributes?: {
key: string;
value: string;
}[];
mergedIntoProductId?: string;
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
}[];
};
;


    export type categoriesInp = {
      
      productsPreview?: number | productsInp
    }


    export type categoriesSchema = {
_id?: string;
code: string;
name: string;
normalizedName: string;
localizedNames?: {
locale: string;
value: string;
}[];
parentCategoryId?: string;
ancestorIds: string[];
depth: number;
sortOrder: number;
taxonomyVersion: number;
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
productsPreview: {
_id?: string;
name: string;
normalizedName: string;
localizedNames?: {
locale: string;
value: string;
}[];
identifiers: {
scheme: string;
value: string;
normalizedValue: string;
jurisdiction?: string;
issuer?: string;
status: ("VERIFIED" | "UNVERIFIED" | "DISPUTED" | "RETIRED" );
sourceSnapshotIds?: string[];
validFrom?: Date;
validTo?: Date;
}[];
brandMapping: {
state: ("CONFIRMED" | "UNVERIFIED" | "CONFLICTING" | "NONE" );
summary?: string;
};
packaging?: {
format?: string;
quantity?: number;
unit?: string;
};
attributes?: {
key: string;
value: string;
}[];
mergedIntoProductId?: string;
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
}[];
};
;


    export type organizationsInp = {
      
      
    }


    export type organizationsSchema = {
_id?: string;
name: string;
normalizedName: string;
kind: ("CORPORATE_GROUP" | "LEGAL_ENTITY" | "PUBLIC_BODY" | "NON_PROFIT" | "RETAILER" | "OTHER_REVIEWED" );
aliases?: {
value: string;
normalizedValue: string;
}[];
identifiers?: {
scheme: string;
value: string;
normalizedValue: string;
jurisdiction?: string;
}[];
operatingCountryCodes?: string[];
internalNotes?: {
body: string;
authorId: string;
createdAt: Date;
visibility: ("INTERNAL" | "LEGAL" | "ADMIN" );
}[];
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
};
;


    export type sourcesInp = {
      
      recentSnapshotsPreview?: number | source_snapshotsInp
    }


    export type sourcesSchema = {
_id?: string;
title: string;
canonicalUrl: string;
sourceType: ("GOVERNMENT_REGISTRY" | "COMPANY_STATEMENT" | "NEWS_ARTICLE" | "NGO_REPORT" | "COURT_RECORD" | "OTHER_REVIEWED" );
publisherName?: string;
publisherOrganizationId?: string;
language?: string;
countryCode?: string;
jurisdiction?: string;
access: ("PUBLIC" | "RESTRICTED" | "PAYWALLED" );
usageTerms?: string;
lastCapturedAt?: Date;
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
recentSnapshotsPreview: {
_id?: string;
titleAtCapture: string;
canonicalUrlAtCapture: string;
publishedAt?: Date;
retrievedAt: Date;
contentHash: string;
hashAlgorithm: ("SHA-256" );
mimeType: string;
byteSize: number;
assetId?: string;
captureMethod: ("MANUAL_UPLOAD" | "URL_FETCH" | "API_IMPORT" );
acquisitionTier: ("PRIMARY" | "SECONDARY" | "TERTIARY" );
capturedBy?: string;
captureMetadata?: {
httpStatus?: number;
finalUrl?: string;
userAgent?: string;
};
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
}[];
};
;


    export type assetsInp = {
      
      
    }


    export type assetsSchema = {
_id?: string;
storage: {
provider: ("LOCAL_DEV" | "S3_COMPATIBLE" );
bucket: string;
objectKey: string;
};
originalFileName: string;
safeDisplayName: string;
mimeType: string;
byteSize: number;
sha256: string;
processingStatus: ("QUARANTINED" | "SCANNING" | "CLEAN" | "REJECTED" );
visibility: ("PUBLIC" | "INTERNAL" | "RESTRICTED" | "REDACTED" );
uploadedBy?: string;
uploadedAt: Date;
malwareScan?: {
status: ("PENDING" | "CLEAN" | "INFECTED" | "FAILED" );
scanner?: string;
scannedAt?: Date;
};
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
};
;


    export type productsInp = {
      brand?: number | brandsInp
category?: number | categoriesInp
      
    }


    export type productsSchema = {
_id?: string;
name: string;
normalizedName: string;
localizedNames?: {
locale: string;
value: string;
}[];
identifiers: {
scheme: string;
value: string;
normalizedValue: string;
jurisdiction?: string;
issuer?: string;
status: ("VERIFIED" | "UNVERIFIED" | "DISPUTED" | "RETIRED" );
sourceSnapshotIds?: string[];
validFrom?: Date;
validTo?: Date;
}[];
brandMapping: {
state: ("CONFIRMED" | "UNVERIFIED" | "CONFLICTING" | "NONE" );
summary?: string;
};
packaging?: {
format?: string;
quantity?: number;
unit?: string;
};
attributes?: {
key: string;
value: string;
}[];
mergedIntoProductId?: string;
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
brand?: {
_id?: string;
name: string;
normalizedName: string;
aliases?: {
value: string;
normalizedValue: string;
locale?: string;
}[];
website?: string;
logoAssetId?: string;
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
};
category?: {
_id?: string;
code: string;
name: string;
normalizedName: string;
localizedNames?: {
locale: string;
value: string;
}[];
parentCategoryId?: string;
ancestorIds: string[];
depth: number;
sortOrder: number;
taxonomyVersion: number;
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
};
};
;


    export type source_snapshotsInp = {
      source?: number | sourcesInp
      
    }


    export type source_snapshotsSchema = {
_id?: string;
titleAtCapture: string;
canonicalUrlAtCapture: string;
publishedAt?: Date;
retrievedAt: Date;
contentHash: string;
hashAlgorithm: ("SHA-256" );
mimeType: string;
byteSize: number;
assetId?: string;
captureMethod: ("MANUAL_UPLOAD" | "URL_FETCH" | "API_IMPORT" );
acquisitionTier: ("PRIMARY" | "SECONDARY" | "TERTIARY" );
capturedBy?: string;
captureMetadata?: {
httpStatus?: number;
finalUrl?: string;
userAgent?: string;
};
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
source: {
_id?: string;
title: string;
canonicalUrl: string;
sourceType: ("GOVERNMENT_REGISTRY" | "COMPANY_STATEMENT" | "NEWS_ARTICLE" | "NGO_REPORT" | "COURT_RECORD" | "OTHER_REVIEWED" );
publisherName?: string;
publisherOrganizationId?: string;
language?: string;
countryCode?: string;
jurisdiction?: string;
access: ("PUBLIC" | "RESTRICTED" | "PAYWALLED" );
usageTerms?: string;
lastCapturedAt?: Date;
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
};
};
;


    export type relationshipsInp = {
      
      
    }


    export type relationshipsSchema = {
_id?: string;
predicate: ("OWNS" | "CONTROLS" | "SUBSIDIARY_OF" | "MANUFACTURES" | "DISTRIBUTES" | "IMPORTS_TO_MARKET" | "EXPORTS_TO_MARKET" | "SUPPLIES" | "OPERATES" );
predicateRegistryVersion: number;
context: {
marketCountryCode?: string;
productCategoryCode?: string;
};
validity: {
validFrom?: Date;
validTo?: Date;
};
review: {
status: ("NOT_QUEUED" | "QUEUED" | "IN_REVIEW" | "NEEDS_INFORMATION" | "READY_FOR_DECISION" | "CLOSED" );
assignedTo?: string;
priority?: number;
};
assessment: {
outcome: ("NOT_ASSESSED" | "SUPPORTED" | "PARTIALLY_SUPPORTED" | "NOT_SUPPORTED" | "DISPUTED" | "INCONCLUSIVE" );
summary?: string;
assessedBy?: string;
};
publication: {
status: ("DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "WITHHELD" | "RETRACTED" );
decidedBy?: string;
publishedAt?: Date;
withheldReason?: string;
visibility?: ("PUBLIC" | "INTERNAL" | "RESTRICTED" );
};
evidence?: {
sourceSnapshotId: string;
stance: ("SUPPORTS" | "CONTRADICTS" | "CONTEXTUALIZES" | "NEUTRAL" );
locator?: string;
excerpt?: string;
rationale?: string;
reviewerId?: string;
}[];
organizationResponses?: {
respondingOrganizationId: string;
statement: string;
receivedAt: Date;
authorityVerified: boolean;
publication?: {
status: ("DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "WITHHELD" | "RETRACTED" );
decidedBy?: string;
publishedAt?: Date;
withheldReason?: string;
visibility?: ("PUBLIC" | "INTERNAL" | "RESTRICTED" );
};
}[];
researchNotes?: {
body: string;
authorId: string;
createdAt: Date;
visibility: ("INTERNAL" | "LEGAL" | "ADMIN" );
}[];
recentRevisionPreview?: {
version: number;
changedPaths: string[];
changedAt: Date;
changedBy?: string;
}[];
canonicalKey: string;
recordedAt: Date;
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
};
;


    export type claimsInp = {
      
      
    }


    export type claimsSchema = {
_id?: string;
claimType: ("MARKET_PRESENCE" | "PRODUCT_ORIGIN" | "MANUFACTURING_LOCATION" | "CORPORATE_ACTIVITY" | "OFFICIAL_STATEMENT" | "PRODUCT_ATTRIBUTE" | "OTHER_REVIEWED_TYPE" );
statement: string;
localizedStatements?: {
locale: string;
statement: string;
}[];
scope: {
marketCountryCode?: string;
validFrom?: Date;
validTo?: Date;
};
review: {
status: ("NOT_QUEUED" | "QUEUED" | "IN_REVIEW" | "NEEDS_INFORMATION" | "READY_FOR_DECISION" | "CLOSED" );
assignedTo?: string;
priority?: number;
};
assessment: {
outcome: ("NOT_ASSESSED" | "SUPPORTED" | "PARTIALLY_SUPPORTED" | "NOT_SUPPORTED" | "DISPUTED" | "INCONCLUSIVE" );
summary?: string;
assessedBy?: string;
};
publication: {
status: ("DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "WITHHELD" | "RETRACTED" );
decidedBy?: string;
publishedAt?: Date;
withheldReason?: string;
visibility?: ("PUBLIC" | "INTERNAL" | "RESTRICTED" );
};
evidence?: {
sourceSnapshotId: string;
stance: ("SUPPORTS" | "CONTRADICTS" | "CONTEXTUALIZES" | "NEUTRAL" );
locator?: string;
excerpt?: string;
rationale?: string;
reviewerId?: string;
}[];
organizationResponses?: {
respondingOrganizationId: string;
statement: string;
receivedAt: Date;
authorityVerified: boolean;
publication?: {
status: ("DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "WITHHELD" | "RETRACTED" );
decidedBy?: string;
publishedAt?: Date;
withheldReason?: string;
visibility?: ("PUBLIC" | "INTERNAL" | "RESTRICTED" );
};
}[];
researchNotes?: {
body: string;
authorId: string;
createdAt: Date;
visibility: ("INTERNAL" | "LEGAL" | "ADMIN" );
}[];
recordedAt: Date;
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
};
;


    export type correctionsInp = {
      
      
    }


    export type correctionsSchema = {
_id?: string;
submissionKind: ("CORRECTION" | "COMPLETION" | "CHALLENGE" | "RETRACTION" | "MISSING_ENTITY" );
proposedChange: {
fieldKey: string;
operation: ("SET" | "UNSET" | "ADD" | "REMOVE" );
};
reason: string;
evidenceReferences?: string[];
submittedBy: string;
submittedAt: Date;
status: ("SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "APPLIED" | "WITHDRAWN" );
review: {
status: ("NOT_QUEUED" | "QUEUED" | "IN_REVIEW" | "NEEDS_INFORMATION" | "READY_FOR_DECISION" | "CLOSED" );
assignedTo?: string;
priority?: number;
};
application?: {
appliedAt: Date;
appliedBy: string;
resultVersion: number;
idempotencyKey: string;
};
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
};
;


    export type audit_eventsInp = {
      
      
    }


    export type audit_eventsSchema = {
_id?: string;
eventSchemaVersion: number;
action: ("CREATE" | "UPDATE" | "RELATION_CHANGE" | "PUBLISH" | "RETRACT" | "CORRECTION_SUBMIT" | "CORRECTION_APPROVE" | "CORRECTION_APPLY" | "PERMISSION_CHANGE" | "ASSET_CHANGE" );
requestId: string;
correlationId?: string;
targetVersionBefore?: number;
targetVersionAfter?: number;
changedPaths: string[];
reason?: string;
occurredAt: Date;
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt?: Date;
createdBy?: string;
updatedBy?: string;
};
;


    export type ReqType = {

  
        main: {

      
        products: {

      
            getPublicProfile: {
set: {
gtin: string;
};
get?: {
profile?: boolean;
claims?: boolean;
};
};

          
            searchPublic: {
set: {
query: string;
limit?: number;
};
get?: {
name?: boolean;
};
};

          
          }

        
        claims: {

      
            listForProduct: {
set: {
productId: string;
publication?: ("PUBLISHED" | "WITHHELD" | "RETRACTED" );
};
get?: {
statement?: boolean;
outcome?: boolean;
};
};

          
          }

        
        }

      
    };

  
export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export const lesanApi = (
	{ URL, settings, baseHeaders }: {
		URL: string;
		settings?: Record<string, any>;
		baseHeaders?: Record<string, any>;
	},
) => {
	const setting = {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...baseHeaders,
		},
		...settings,
	};

	const setHeaders = (headers: Record<string, any>) => {
		setting.headers = {
			...setting.headers,
			...headers,
		};
	};

	const getSetting = () => setting;

	const send = async <
		TService extends keyof ReqType,
		TModel extends keyof ReqType[TService],
		TAct extends keyof ReqType[TService][TModel],
    // @ts-ignore: Unreachable code error
		TSet extends DeepPartial<ReqType[TService][TModel][TAct]["set"]>,
    // @ts-ignore: Unreachable code error
		TGet extends DeepPartial<ReqType[TService][TModel][TAct]["get"]>,
	>(body: {
		service?: TService;
		model: TModel;
		act: TAct;
		details: {
			set: TSet;
			get: TGet;
		};
	}, additionalHeaders?: Record<string, any>) => {
		const req = await fetch(URL, {
			...getSetting(),
			headers: {
				...getSetting().headers,
				...additionalHeaders,
		    connection: "keep-alive",
			},
			body: JSON.stringify(body),
		});

		return await req.json();
	};

	return { send, setHeaders };
};

  