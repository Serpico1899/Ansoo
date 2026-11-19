
/* eslint-disable */

  
    export type usersInp = {
      
      
    }


    export type usersSchema = {
_id?: string;
authProvider: string;
authSubject: string;
email?: string;
emailNormalized?: string;
phone?: string;
displayName?: string;
preferredLocale?: string;
roles: ("CONTRIBUTOR" | "RESEARCHER" | "RESEARCH_REVIEWER" | "LEGAL_REVIEWER" | "MODERATOR" | "ADMIN" )[];
trustLevel: ("NEW" | "REGULAR" | "TRUSTED" );
accountStatus: ("PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED" );
lastActiveAt?: Date;
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt: Date;
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
matchKey: string;
localizedNames?: {
locale: string;
value: string;
}[];
aliases: {
_id: string;
value: string;
normalizedValue: string;
matchKey: string;
locale?: string;
sourceSnapshotId?: string;
}[];
description?: string;
website?: string;
logoAssetId?: string;
identityProvenance?: {
sourceSnapshotIds?: string[];
lastVerifiedAt?: Date;
verifiedBy?: string;
};
lifecycle: ("ACTIVE" | "INACTIVE" | "ARCHIVED" | "MERGED" );
mergedIntoId?: string;
mergedAt?: Date;
mergedBy?: string;
mergeReason?: string;
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt: Date;
createdBy?: string;
updatedBy?: string;
productsPreview: {
_id?: string;
name: string;
normalizedName: string;
matchKey: string;
localizedNames?: {
locale: string;
value: string;
}[];
description?: string;
identifiers: {
_id: string;
scheme: ("GTIN" | "IR_PRODUCT_ID" | "IR_TRACKING_ID" | "TAX_PRODUCT_SERVICE_ID" | "HS_CODE" | "IRC" | "TTAC_UID" | "SKU" );
value: string;
normalizedValue: string;
matchValue?: string;
jurisdiction?: string;
issuer?: string;
status: ("UNVERIFIED" | "VERIFIED" | "DISPUTED" | "RETIRED" );
sourceSnapshotIds?: string[];
validFrom?: Date;
validTo?: Date;
}[];
categoryCode?: string;
brandMapping: {
status: ("UNREVIEWED" | "CANDIDATE" | "VERIFIED" | "DISPUTED" | "REJECTED" );
candidateBrandId?: string;
rationale?: string;
reviewedAt?: Date;
reviewedBy?: string;
evidenceSnapshotIds?: string[];
};
identityProvenance?: {
sourceSnapshotIds?: string[];
lastVerifiedAt?: Date;
verifiedBy?: string;
};
packaging?: {
netContentValue?: number;
netContentUnit?: string;
packCount?: number;
packageType?: string;
variant?: string;
};
attributes?: {
key: ("DECLARED_ORIGIN" | "INGREDIENTS_TEXT" | "MANUFACTURER_ON_PACKAGE" | "IMPORTER_ON_PACKAGE" | "NET_CONTENT_TEXT" );
value: string;
unit?: string;
locale?: string;
sourceSnapshotId?: string;
}[];
lifecycle: ("ACTIVE" | "INACTIVE" | "ARCHIVED" | "MERGED" );
mergedIntoId?: string;
mergedAt?: Date;
mergedBy?: string;
mergeReason?: string;
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt: Date;
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
matchKey: string;
localizedNames?: {
locale: string;
value: string;
}[];
kind: ("CORPORATE_GROUP" | "LEGAL_ENTITY" | "GOVERNMENT_BODY" | "PUBLIC_INSTITUTION" | "NON_PROFIT" | "RETAILER" | "OTHER" );
aliases: {
_id: string;
value: string;
normalizedValue: string;
matchKey: string;
locale?: string;
sourceSnapshotId?: string;
}[];
identifiers: {
_id: string;
scheme: ("NATIONAL_ID" | "REGISTRATION_NUMBER" | "LEI" | "TAX_ID" );
value: string;
normalizedValue: string;
jurisdiction?: string;
issuer?: string;
status: ("UNVERIFIED" | "VERIFIED" | "DISPUTED" | "RETIRED" );
sourceSnapshotIds?: string[];
}[];
legalProfile?: {
jurisdiction?: string;
legalForm?: string;
incorporationDate?: Date;
registeredAddress?: string;
};
website?: string;
operatingCountryCodes?: string[];
identityProvenance?: {
sourceSnapshotIds?: string[];
lastVerifiedAt?: Date;
verifiedBy?: string;
};
description?: string;
lifecycle: ("ACTIVE" | "INACTIVE" | "ARCHIVED" | "MERGED" );
mergedIntoId?: string;
mergedAt?: Date;
mergedBy?: string;
mergeReason?: string;
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt: Date;
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
canonicalUrl?: string;
sourceType: ("OFFICIAL_REGISTRY" | "GOVERNMENT_DOCUMENT" | "LEGAL_INSTRUMENT" | "COMPANY_DOCUMENT" | "RESEARCH_REPORT" | "NEWS" | "ACADEMIC" | "DATASET" | "OTHER" );
publisherName?: string;
publisherOrganizationId?: string;
publisherVerified: boolean;
language?: string;
countryCode?: string;
jurisdiction?: string;
access: ("PUBLIC" | "RESTRICTED" | "INTERNAL" );
usageTerms?: string;
licenseCode?: string;
attributionRequired: boolean;
lifecycle: ("ACTIVE" | "UNAVAILABLE" | "ARCHIVED" );
lastCapturedAt?: Date;
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt: Date;
createdBy?: string;
updatedBy?: string;
recentSnapshotsPreview: {
_id?: string;
titleAtCapture?: string;
canonicalUrlAtCapture?: string;
publishedAt?: Date;
retrievedAt: Date;
contentHash: string;
hashAlgorithm: ("SHA256" );
mimeType?: string;
byteSize?: number;
assetId?: string;
captureMethod: ("MANUAL" | "CRAWLER" | "API" | "UPLOAD" );
acquisitionTier: ("A_OFFICIAL_MACHINE_READABLE" | "B_OFFICIAL_PUBLIC_LOOKUP" | "C_OFFICIAL_AUTHENTICATED_ACCESS" | "D_FORMAL_INFORMATION_REQUEST" | "E_RESEARCH_OR_COMMUNITY" );
capturedBy?: string;
supersedesSnapshotId?: string;
supersededBySnapshotId?: string;
redaction?: {
redactedAssetId: string;
reason: string;
redactedAt: Date;
redactedBy: string;
method: ("PIXEL" | "TEXT_REMOVAL" | "PAGE_REMOVAL" );
originalRetained: "true";
};
lifecycle: ("AVAILABLE" | "UNAVAILABLE" | "ARCHIVED" );
schemaVersion: number;
createdAt: Date;
}[];
};
;


    export type assetsInp = {
      
      
    }


    export type assetsSchema = {
_id?: string;
storage: {
provider: ("S3_COMPATIBLE" | "LOCAL_DEV" );
bucket?: string;
objectKey: string;
};
originalFileName?: string;
safeDisplayName?: string;
mimeType: string;
byteSize: number;
sha256: string;
processingStatus: ("QUARANTINED" | "SCANNING" | "READY" | "REJECTED" );
visibility: ("PRIVATE" | "RESEARCH_ONLY" | "PUBLIC_APPROVED" );
uploadedBy?: string;
uploadedAt: Date;
malwareScan?: {
engine?: string;
result: ("CLEAN" | "INFECTED" | "ERROR" );
scannedAt: Date;
};
exifStripped: boolean;
retentionUntil?: Date;
legalHold: boolean;
purgedAt?: Date;
lifecycle: ("ACTIVE" | "ARCHIVED" | "DELETED_PENDING_PURGE" );
version: number;
schemaVersion: number;
};
;


    export type productsInp = {
      brand?: number | brandsInp
      
    }


    export type productsSchema = {
_id?: string;
name: string;
normalizedName: string;
matchKey: string;
localizedNames?: {
locale: string;
value: string;
}[];
description?: string;
identifiers: {
_id: string;
scheme: ("GTIN" | "IR_PRODUCT_ID" | "IR_TRACKING_ID" | "TAX_PRODUCT_SERVICE_ID" | "HS_CODE" | "IRC" | "TTAC_UID" | "SKU" );
value: string;
normalizedValue: string;
matchValue?: string;
jurisdiction?: string;
issuer?: string;
status: ("UNVERIFIED" | "VERIFIED" | "DISPUTED" | "RETIRED" );
sourceSnapshotIds?: string[];
validFrom?: Date;
validTo?: Date;
}[];
categoryCode?: string;
brandMapping: {
status: ("UNREVIEWED" | "CANDIDATE" | "VERIFIED" | "DISPUTED" | "REJECTED" );
candidateBrandId?: string;
rationale?: string;
reviewedAt?: Date;
reviewedBy?: string;
evidenceSnapshotIds?: string[];
};
identityProvenance?: {
sourceSnapshotIds?: string[];
lastVerifiedAt?: Date;
verifiedBy?: string;
};
packaging?: {
netContentValue?: number;
netContentUnit?: string;
packCount?: number;
packageType?: string;
variant?: string;
};
attributes?: {
key: ("DECLARED_ORIGIN" | "INGREDIENTS_TEXT" | "MANUFACTURER_ON_PACKAGE" | "IMPORTER_ON_PACKAGE" | "NET_CONTENT_TEXT" );
value: string;
unit?: string;
locale?: string;
sourceSnapshotId?: string;
}[];
lifecycle: ("ACTIVE" | "INACTIVE" | "ARCHIVED" | "MERGED" );
mergedIntoId?: string;
mergedAt?: Date;
mergedBy?: string;
mergeReason?: string;
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt: Date;
createdBy?: string;
updatedBy?: string;
brand?: {
_id?: string;
name: string;
normalizedName: string;
matchKey: string;
lifecycle: ("ACTIVE" | "INACTIVE" | "ARCHIVED" | "MERGED" );
};
};
;


    export type source_snapshotsInp = {
      source?: number | sourcesInp
      
    }


    export type source_snapshotsSchema = {
_id?: string;
titleAtCapture?: string;
canonicalUrlAtCapture?: string;
publishedAt?: Date;
retrievedAt: Date;
contentHash: string;
hashAlgorithm: ("SHA256" );
mimeType?: string;
byteSize?: number;
assetId?: string;
captureMethod: ("MANUAL" | "CRAWLER" | "API" | "UPLOAD" );
acquisitionTier: ("A_OFFICIAL_MACHINE_READABLE" | "B_OFFICIAL_PUBLIC_LOOKUP" | "C_OFFICIAL_AUTHENTICATED_ACCESS" | "D_FORMAL_INFORMATION_REQUEST" | "E_RESEARCH_OR_COMMUNITY" );
capturedBy?: string;
supersedesSnapshotId?: string;
supersededBySnapshotId?: string;
redaction?: {
redactedAssetId: string;
reason: string;
redactedAt: Date;
redactedBy: string;
method: ("PIXEL" | "TEXT_REMOVAL" | "PAGE_REMOVAL" );
originalRetained: "true";
};
lifecycle: ("AVAILABLE" | "UNAVAILABLE" | "ARCHIVED" );
schemaVersion: number;
createdAt: Date;
source: {
_id?: string;
title: string;
canonicalUrl?: string;
sourceType: ("OFFICIAL_REGISTRY" | "GOVERNMENT_DOCUMENT" | "LEGAL_INSTRUMENT" | "COMPANY_DOCUMENT" | "RESEARCH_REPORT" | "NEWS" | "ACADEMIC" | "DATASET" | "OTHER" );
publisherName?: string;
publisherOrganizationId?: string;
publisherVerified: boolean;
language?: string;
countryCode?: string;
jurisdiction?: string;
access: ("PUBLIC" | "RESTRICTED" | "INTERNAL" );
usageTerms?: string;
licenseCode?: string;
attributionRequired: boolean;
lifecycle: ("ACTIVE" | "UNAVAILABLE" | "ARCHIVED" );
lastCapturedAt?: Date;
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt: Date;
createdBy?: string;
updatedBy?: string;
};
};
;


    export type relationshipsInp = {
      
      
    }


    export type relationshipsSchema = {
_id?: string;
subject: {
type: ("PRODUCT" | "BRAND" | "ORGANIZATION" );
id: string;
};
predicate: ("OWNS" | "CONTROLS" | "MANUFACTURES" | "DISTRIBUTES" | "IMPORTS_TO_MARKET" );
predicateRegistryVersion: number;
object: {
type: ("PRODUCT" | "BRAND" | "ORGANIZATION" );
id: string;
};
context?: {
marketCountryCode?: string;
jurisdiction?: string;
ownership?: {
sharePercentage?: number;
basis?: ("DIRECT" | "INDIRECT" | "VOTING_RIGHTS" | "OTHER_DOCUMENTED" );
notes?: string;
};
notes?: string;
};
validity: {
validFrom?: Date;
validTo?: Date;
datePrecision: ("EXACT" | "MONTH" | "YEAR" | "APPROXIMATE" | "UNKNOWN" );
};
sensitivity: ("ROUTINE" | "SENSITIVE" | "HIGH_RISK" );
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
review: {
status: ("NOT_QUEUED" | "QUEUED" | "IN_REVIEW" | "NEEDS_INFORMATION" | "READY_FOR_DECISION" | "CLOSED" );
assignedTo?: string;
priority: ("LOW" | "NORMAL" | "HIGH" | "URGENT" );
openedAt?: Date;
lastActionAt?: Date;
closedAt?: Date;
};
assessment: {
outcome: ("NOT_ASSESSED" | "SUPPORTED" | "PARTIALLY_SUPPORTED" | "NOT_SUPPORTED" | "DISPUTED" | "INCONCLUSIVE" );
summary?: string;
assessedAt?: Date;
assessedBy?: string;
methodologyVersion: string;
limitations: ("SELF_REPORTED" | "SINGLE_SOURCE" | "OUTDATED" | "TRANSLATED" | "PAYWALLED" | "UNVERIFIED_PUBLISHER" | "PARTIAL_SCOPE" | "INDIRECT_INFERENCE" | "SECONDARY_REPORTING" )[];
};
publication: {
status: ("DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "WITHHELD" | "RETRACTED" );
decidedBy?: string;
decidedAt?: Date;
publishedAt?: Date;
retractedAt?: Date;
retractionReason?: string;
reason?: string;
};
publicationGate?: {
gateVersion: "1";
evaluatedAt: Date;
sensitivity: ("ROUTINE" | "SENSITIVE" | "HIGH_RISK" );
checks: {
evidenceCountOk: boolean;
independentSourcesOk: boolean;
assessmentOk: boolean;
fourEyesOk: boolean;
legalSignOffOk: boolean;
rightOfReplyOk: boolean;
publicWordingOk: boolean;
sourceAccessOk: boolean;
noScoreOk: boolean;
};
result: ("PASS" | "FAIL" );
failures: string[];
waivers: {
check: string;
reason: string;
approvedBy: string;
approvedAt: Date;
}[];
};
publicWording?: string;
evidence: {
_id: string;
sourceSnapshotId: string;
stance: ("SUPPORTS" | "CONTRADICTS" | "CONTEXTUALIZES" | "NEUTRAL" );
locator?: {
page?: number;
section?: string;
paragraph?: string;
timestamp?: string;
urlFragment?: string;
};
excerpt?: string;
rationale?: string;
addedBy: string;
addedAt: Date;
reviewedBy?: string;
reviewedAt?: Date;
}[];
organizationResponses: {
_id: string;
respondingOrganizationId: string;
responseText: string;
submittedAt: Date;
receivedVia: ("OFFICIAL_EMAIL" | "OFFICIAL_FORM" | "PUBLIC_STATEMENT" | "OTHER" );
sourceSnapshotId?: string;
attachmentAssetIds?: string[];
representativeVerification: {
status: ("UNVERIFIED" | "VERIFIED" | "DISPUTED" );
basis?: string;
reviewedBy?: string;
reviewedAt?: Date;
};
publicationStatus: ("INTERNAL" | "PUBLIC_PENDING" | "PUBLIC" | "REDACTED" );
reviewedBy?: string;
reviewedAt?: Date;
solicitationId?: string;
}[];
responseSolicitations: {
_id: string;
organizationId: string;
channel: ("OFFICIAL_EMAIL" | "OFFICIAL_FORM" | "REGISTERED_MAIL" | "PUBLIC_CONTACT" | "OTHER" );
sentAt: Date;
sentBy: string;
assertionsSummary: string;
responseDeadline: Date;
outcome: ("PENDING" | "RESPONDED" | "NO_RESPONSE" | "DECLINED" | "UNDELIVERABLE" );
outcomeAt?: Date;
proofAssetId?: string;
responseId?: string;
}[];
researchNotes: {
_id: string;
authorId: string;
body: string;
visibility: ("INTERNAL_RESEARCH" | "LEGAL_REVIEW" | "ADMIN_ONLY" );
createdAt: Date;
updatedAt?: Date;
}[];
recentRevisionPreview: {
version: number;
changedAt: Date;
changedBy?: string;
reason: string;
changedFields: string[];
}[];
canonicalKey?: string;
recordedAt: Date;
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt: Date;
createdBy?: string;
updatedBy?: string;
};
;


    export type claimsInp = {
      
      
    }


    export type claimsSchema = {
_id?: string;
about: {
type: ("PRODUCT" | "BRAND" | "ORGANIZATION" | "RELATIONSHIP" );
id: string;
};
relatedEntities?: {
type: ("PRODUCT" | "BRAND" | "ORGANIZATION" );
id: string;
}[];
claimType: ("MARKET_PRESENCE" | "PRODUCT_ORIGIN" | "OFFICIAL_STATEMENT" );
claimTypeRegistryVersion: number;
statement: string;
publicWording?: string;
localizedStatements?: {
locale: string;
value: string;
}[];
structuredValue: string;
scope?: {
marketCountryCode?: string;
jurisdiction?: string;
validFrom?: Date;
validTo?: Date;
datePrecision?: ("EXACT" | "MONTH" | "YEAR" | "APPROXIMATE" | "UNKNOWN" );
};
sensitivity: ("ROUTINE" | "SENSITIVE" | "HIGH_RISK" );
recordLifecycle: ("ACTIVE" | "ARCHIVED" );
review: {
status: ("NOT_QUEUED" | "QUEUED" | "IN_REVIEW" | "NEEDS_INFORMATION" | "READY_FOR_DECISION" | "CLOSED" );
assignedTo?: string;
priority: ("LOW" | "NORMAL" | "HIGH" | "URGENT" );
openedAt?: Date;
lastActionAt?: Date;
closedAt?: Date;
};
assessment: {
outcome: ("NOT_ASSESSED" | "SUPPORTED" | "PARTIALLY_SUPPORTED" | "NOT_SUPPORTED" | "DISPUTED" | "INCONCLUSIVE" );
summary?: string;
assessedAt?: Date;
assessedBy?: string;
methodologyVersion: string;
limitations: ("SELF_REPORTED" | "SINGLE_SOURCE" | "OUTDATED" | "TRANSLATED" | "PAYWALLED" | "UNVERIFIED_PUBLISHER" | "PARTIAL_SCOPE" | "INDIRECT_INFERENCE" | "SECONDARY_REPORTING" )[];
};
publication: {
status: ("DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "WITHHELD" | "RETRACTED" );
decidedBy?: string;
decidedAt?: Date;
publishedAt?: Date;
retractedAt?: Date;
retractionReason?: string;
reason?: string;
};
publicationGate?: {
gateVersion: "1";
evaluatedAt: Date;
sensitivity: ("ROUTINE" | "SENSITIVE" | "HIGH_RISK" );
checks: {
evidenceCountOk: boolean;
independentSourcesOk: boolean;
assessmentOk: boolean;
fourEyesOk: boolean;
legalSignOffOk: boolean;
rightOfReplyOk: boolean;
publicWordingOk: boolean;
sourceAccessOk: boolean;
noScoreOk: boolean;
};
result: ("PASS" | "FAIL" );
failures: string[];
waivers: {
check: string;
reason: string;
approvedBy: string;
approvedAt: Date;
}[];
};
evidence: {
_id: string;
sourceSnapshotId: string;
stance: ("SUPPORTS" | "CONTRADICTS" | "CONTEXTUALIZES" | "NEUTRAL" );
locator?: {
page?: number;
section?: string;
paragraph?: string;
timestamp?: string;
urlFragment?: string;
};
excerpt?: string;
rationale?: string;
addedBy: string;
addedAt: Date;
reviewedBy?: string;
reviewedAt?: Date;
}[];
organizationResponses: {
_id: string;
respondingOrganizationId: string;
responseText: string;
submittedAt: Date;
receivedVia: ("OFFICIAL_EMAIL" | "OFFICIAL_FORM" | "PUBLIC_STATEMENT" | "OTHER" );
sourceSnapshotId?: string;
attachmentAssetIds?: string[];
representativeVerification: {
status: ("UNVERIFIED" | "VERIFIED" | "DISPUTED" );
basis?: string;
reviewedBy?: string;
reviewedAt?: Date;
};
publicationStatus: ("INTERNAL" | "PUBLIC_PENDING" | "PUBLIC" | "REDACTED" );
reviewedBy?: string;
reviewedAt?: Date;
solicitationId?: string;
}[];
responseSolicitations: {
_id: string;
organizationId: string;
channel: ("OFFICIAL_EMAIL" | "OFFICIAL_FORM" | "REGISTERED_MAIL" | "PUBLIC_CONTACT" | "OTHER" );
sentAt: Date;
sentBy: string;
assertionsSummary: string;
responseDeadline: Date;
outcome: ("PENDING" | "RESPONDED" | "NO_RESPONSE" | "DECLINED" | "UNDELIVERABLE" );
outcomeAt?: Date;
proofAssetId?: string;
responseId?: string;
}[];
researchNotes: {
_id: string;
authorId: string;
body: string;
visibility: ("INTERNAL_RESEARCH" | "LEGAL_REVIEW" | "ADMIN_ONLY" );
createdAt: Date;
updatedAt?: Date;
}[];
recentRevisionPreview: {
version: number;
changedAt: Date;
changedBy?: string;
reason: string;
changedFields: string[];
}[];
recordedAt: Date;
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt: Date;
createdBy?: string;
updatedBy?: string;
};
;


    export type correctionsInp = {
      
      
    }


    export type correctionsSchema = {
_id?: string;
target?: {
type: ("PRODUCT" | "BRAND" | "ORGANIZATION" | "RELATIONSHIP" | "CLAIM" | "SOURCE" | "SOURCE_SNAPSHOT" );
id: string;
};
submissionKind: ("CORRECT_EXISTING" | "ADD_MISSING" | "RETRACT" | "REPORT_ISSUE" );
proposedChange?: {
fieldKey: string;
operation: ("SET" | "UNSET" | "ADD_RELATIONSHIP" | "END_RELATIONSHIP" );
proposedEntity?: {
type: ("PRODUCT" | "BRAND" | "ORGANIZATION" );
id: string;
};
};
reason: string;
evidenceReferences: {
sourceSnapshotId?: string;
assetId?: string;
url?: string;
note?: string;
}[];
submittedBy: string;
submittedAt: Date;
submissionIpHash?: string;
idempotencyKey: string;
status: ("PENDING" | "IN_REVIEW" | "NEEDS_INFORMATION" | "APPROVED" | "REJECTED" | "WITHDRAWN" );
review: {
assignedTo?: string;
reviewedBy?: string;
reviewedAt?: Date;
decisionReason?: string;
};
application?: {
appliedAt?: Date;
appliedBy?: string;
targetVersionBefore?: number;
targetVersionAfter?: number;
result: ("APPLIED" | "FAILED" | "NOT_APPLICABLE" );
failureReason?: string;
idempotencyKey: string;
};
publicNotice?: {
correctedAt: Date;
reason: string;
previousWording: string;
auditEventId: string;
};
schemaVersion: number;
version: number;
createdAt: Date;
updatedAt: Date;
createdBy?: string;
updatedBy?: string;
};
;


    export type audit_eventsInp = {
      
      
    }


    export type audit_eventsSchema = {
_id?: string;
eventSchemaVersion: number;
actor: {
type: ("USER" | "SYSTEM" | "SERVICE" );
id?: string;
};
action: ("ENTITY_CREATED" | "ENTITY_UPDATED" | "ENTITY_ARCHIVED" | "ENTITY_MERGED" | "ENTITY_UNMERGED" | "IDENTIFIER_ADDED" | "IDENTIFIER_STATUS_CHANGED" | "BRAND_MAPPING_REVIEWED" | "BRAND_RELATION_CHANGED" | "RELATIONSHIP_CREATED" | "RELATIONSHIP_CLOSED" | "CLAIM_CREATED" | "REVIEW_STATUS_CHANGED" | "ASSESSMENT_RECORDED" | "PUBLICATION_GATE_EVALUATED" | "PUBLICATION_CHANGED" | "PUBLIC_WORDING_CHANGED" | "FINDING_RETRACTED" | "GATE_WAIVER_GRANTED" | "EVIDENCE_ADDED" | "EVIDENCE_REMOVED" | "EVIDENCE_REVIEWED" | "SOURCE_CREATED" | "SNAPSHOT_CREATED" | "SNAPSHOT_SUPERSEDED" | "SNAPSHOT_REDACTED" | "SOLICITATION_SENT" | "SOLICITATION_OUTCOME_RECORDED" | "ORG_RESPONSE_ADDED" | "ORG_RESPONSE_PUBLICATION_CHANGED" | "ASSET_UPLOADED" | "ASSET_SCAN_COMPLETED" | "ASSET_PURGED" | "CORRECTION_SUBMITTED" | "CORRECTION_REVIEWED" | "CORRECTION_APPLIED" | "USER_ROLES_CHANGED" | "USER_TRUST_CHANGED" | "USER_STATUS_CHANGED" | "USER_PII_PURGED" );
target: {
type: ("PRODUCT" | "BRAND" | "ORGANIZATION" | "RELATIONSHIP" | "CLAIM" | "SOURCE" | "SOURCE_SNAPSHOT" | "ASSET" | "CORRECTION" | "USER" );
id: string;
};
requestId?: string;
correlationId?: string;
idempotencyKey?: string;
targetVersionBefore?: number;
targetVersionAfter?: number;
changedPaths?: string[];
beforeSummary?: Record<string, any>;
afterSummary?: Record<string, any>;
reason?: string;
occurredAt: Date;
};
;


    export type ReqType = {

  
        main: {

      
        products: {

      
            getPublicProfile: {
set: {
id?: string;
gtin?: string;
scheme?: string;
value?: string;
jurisdiction?: string;
issuer?: string;
};
};

          
          }

        
        claims: {

      
            getResearch: {
set: {
id: string;
};
};

          
          }

        
        auditEvents: {

      
            gets: {
set: {
limit?: number;
};
};

          
          }

        
        users: {

      
            login: {
set: {
providerToken: string;
};
};

          
            getMe: {
set: {
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

  