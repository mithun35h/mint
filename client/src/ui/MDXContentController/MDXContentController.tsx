import { MDXProvider } from '@mdx-js/react';
import clsx from 'clsx';
import { createContext, useContext, useState } from 'react';

import { DynamicLink } from '@/components/DynamicLink';
import { Heading } from '@/components/Heading';
import { ConfigContext } from '@/context/ConfigContext';
import { useCurrentPath } from '@/hooks/useCurrentPath';
import { usePrevNext } from '@/hooks/usePrevNext';
import { useTableOfContents } from '@/hooks/useTableOfContents';
import { ContentSideLayout } from '@/layouts/ContentSideLayout';
import { Config } from '@/types/config';
import { PageMetaTags } from '@/types/metadata';
import { OpenApiFile } from '@/types/openApi';
import { ApiComponent, ApiPlayground } from '@/ui/ApiPlayground';
import { Footer } from '@/ui/MDXContentController/Footer';
import { BlogHeader, PageHeader } from '@/ui/MDXContentController/PageHeader';
import { TableOfContents } from '@/ui/MDXContentController/TableOfContents';
import { getParamGroupsFromApiComponents } from '@/utils/api';
import { getOpenApiOperationMethodAndEndpoint } from '@/utils/openApi/getOpenApiContext';
import { getParameterType } from '@/utils/openApi/getParameterType';
import { createExpandable, createParamField, getProperties } from '@/utils/openapi';
import { getSectionTitle } from '@/utils/paths/getSectionTitle';

import { GeneratedRequestExamples, OpenApiResponseExample } from '../../layouts/ApiSupplemental';
import { getAllOpenApiParameters, OpenApiParameters } from '../../layouts/OpenApiParameters';
import { BlogContext } from '../Blog';
import { createUserDefinedExamples } from './createUserDefinedExamples';

export const ContentsContext = createContext(undefined);

type MDXContentControllerProps = {
  children: any;
  pageMetadata: PageMetaTags;
  tableOfContents: any;
  apiComponents: any;
};

export function MDXContentController({
  children,
  pageMetadata,
  tableOfContents,
  apiComponents,
}: MDXContentControllerProps) {
  const { mintConfig, openApiFiles } = useContext(ConfigContext);
  const [apiPlaygroundInputs, setApiPlaygroundInputs] = useState<Record<string, any>>({});
  const [apiBaseIndex, setApiBaseIndex] = useState(0);
  const currentPath = useCurrentPath();
  const toc = [...tableOfContents];

  const { currentTableOfContentsSection, registerHeading, unregisterHeading } =
    useTableOfContents(toc);
  const { prev, next } = usePrevNext();

  const openApiPlaygroundProps = getOpenApiPlaygroundProps(
    apiBaseIndex,
    mintConfig,
    openApiFiles,
    pageMetadata.openapi
  );
  const isApi =
    (pageMetadata.api?.length ?? 0) > 0 || (openApiPlaygroundProps.api?.length ?? 0) > 0;
  const isBlogMode = pageMetadata.mode === 'blog';
  const { requestExample, responseExample } = createUserDefinedExamples(apiComponents);

  // The user can hide the table of contents by marking the size as wide, but the API
  // overrides that to show request and response examples on the side.
  // TODO: Remove meta.size
  const isWideSize = pageMetadata.mode === 'wide' || pageMetadata.size === 'wide';
  let contentWidth = 'max-w-3xl xl:max-w-[49rem]';
  if (isApi || requestExample || responseExample) {
    contentWidth = 'max-w-3xl xl:max-w-[min(100% - 31rem, 44rem)]';
  } else if (isWideSize) {
    contentWidth = 'max-w-3xl';
  }

  const paramGroupDict = getParamGroupsFromApiComponents(
    openApiPlaygroundProps.apiComponents ?? apiComponents,
    pageMetadata.authMethod || mintConfig?.api?.auth?.method,
    mintConfig?.api?.auth?.name
  );
  const paramGroups = Object.entries(paramGroupDict).map(([groupName, params]) => {
    return {
      name: groupName,
      params,
    };
  });
  // TODO - make this undefined when nothing exists
  const api = openApiPlaygroundProps.api ?? pageMetadata.api ?? '';

  const showApiPlayground = isApi && !mintConfig?.api?.hidePlayground;

  return (
    <div className="flex flex-row pt-9 gap-12 items-stretch">
      <div
        className={clsx(
          'relative grow mx-auto xl:-ml-12 overflow-auto xl:pr-1 xl:pl-12',
          contentWidth
        )}
      >
        {isBlogMode ? (
          <BlogHeader pageMetadata={pageMetadata} />
        ) : (
          <PageHeader
            pageMetadata={pageMetadata}
            section={getSectionTitle(currentPath, mintConfig?.navigation ?? [])}
          />
        )}
        {showApiPlayground && (
          <ApiPlayground
            api={api}
            paramGroups={paramGroups}
            contentType={openApiPlaygroundProps.contentType ?? pageMetadata.contentType}
            onInputDataChange={setApiPlaygroundInputs}
            onApiBaseIndexChange={setApiBaseIndex}
          />
        )}

        {/* The MDXProvider here renders the MDX for the page */}
        <div className="relative z-20 prose prose-slate mt-8 dark:prose-dark">
          <ContentsContext.Provider value={{ registerHeading, unregisterHeading } as any}>
            <MDXProvider components={{ a: DynamicLink, Heading }}>{children}</MDXProvider>
          </ContentsContext.Provider>
          {pageMetadata.openapi && <OpenApiParameters endpointStr={pageMetadata.openapi} />}
        </div>

        <Footer
          previous={pageMetadata.hideFooterPagination ? null : prev}
          next={pageMetadata.hideFooterPagination ? null : next}
          hasBottomPadding={!isApi}
        />
      </div>

      {!isWideSize &&
        (isApi || requestExample || responseExample ? (
          <ContentSideLayout sticky>
            <div className="space-y-6 pb-6 w-[28rem]">
              {requestExample}
              {!requestExample && api !== '' && (
                <GeneratedRequestExamples
                  paramGroupDict={paramGroupDict}
                  apiPlaygroundInputs={apiPlaygroundInputs}
                  apiBaseIndex={apiBaseIndex}
                  endpointStr={api}
                />
              )}
              {responseExample}
              {!responseExample && pageMetadata.openapi && (
                <OpenApiResponseExample openapi={pageMetadata.openapi} />
              )}
            </div>
          </ContentSideLayout>
        ) : isBlogMode ? (
          <BlogContext />
        ) : (
          <TableOfContents
            tableOfContents={toc}
            currentSection={currentTableOfContentsSection}
            meta={pageMetadata}
          />
        ))}
    </div>
  );
}

function getOpenApiPlaygroundProps(
  apiBaseIndex: number,
  mintConfig: Config | undefined,
  openApiFiles: OpenApiFile[],
  openApiEndpoint: string | undefined
) {
  // Detect when OpenAPI is missing
  if (!openApiEndpoint || !openApiFiles) {
    return {};
  }

  const { method, endpoint, operation, path } = getOpenApiOperationMethodAndEndpoint(
    openApiEndpoint,
    openApiFiles
  );

  // Detect when OpenAPI string is missing the operation (eg. GET)
  if (!operation) {
    return {};
  }

  // Get the api string with the correct baseUrl
  // endpoint in OpenAPI refers to the path
  const openApiServers = openApiFiles?.reduce((acc: any, file: OpenApiFile) => {
    return acc.concat(file.spec?.servers);
  }, []);
  const configBaseUrl =
    mintConfig?.api?.baseUrl ?? openApiServers?.map((server: { url: string }) => server.url);
  const baseUrl =
    configBaseUrl && Array.isArray(configBaseUrl) ? configBaseUrl[apiBaseIndex] : configBaseUrl;
  const api = `${method} ${baseUrl}${endpoint}`;

  // Get ApiComponents to show in the ApiPlayground
  const parameters = getAllOpenApiParameters(path, operation);
  const apiComponents: ApiComponent[] = [];

  // Get the Parameter ApiComponents
  parameters.forEach((parameter: any, i: number) => {
    const { name, required, schema, in: paramType, example } = parameter;
    const type = schema == null ? parameter?.type : getParameterType(schema);
    const paramField = createParamField({
      [paramType]: name,
      required,
      type,
      default: schema?.default,
      placeholder: example || schema?.enum,
    });
    apiComponents.push(paramField);
  });

  const bodyContent = operation.requestBody?.content;
  const contentType = bodyContent && Object.keys(bodyContent)[0];
  const bodySchema = bodyContent && bodyContent[contentType]?.schema;

  // Get the Body ApiComponents
  if (bodySchema?.properties) {
    Object.entries(bodySchema.properties)?.forEach(([property, propertyValue]: any, i: number) => {
      const required = bodySchema.required?.includes(property);
      const type = getParameterType(propertyValue);
      const bodyDefault = bodySchema.example
        ? JSON.stringify(bodySchema.example[property])
        : undefined;
      const last = i + 1 === operation.parameters?.length;
      let children;
      if (propertyValue.properties) {
        const properties = getProperties(propertyValue.properties);
        children = [createExpandable(properties)];
      } else if (propertyValue.items?.properties) {
        const properties = getProperties(propertyValue.items.properties);
        children = [createExpandable(properties)];
      }
      const paramField = createParamField(
        {
          body: property,
          required,
          type,
          default: bodyDefault,
          enum: propertyValue.enum,
          last,
        },
        children
      );
      apiComponents.push(paramField);
    });
  }

  return {
    api,
    apiComponents,
    contentType,
  };
}
