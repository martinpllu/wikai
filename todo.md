# Launch

I would like to rebrand this application from wikai to 'delve'

I'd like to create a demo video that I can put on GitHub to demonstrate creating a page from scratch and then the various features of the application. I was thinking of creating a page on Coffee and then doing inline asks and edits and then page level asks and edits. Maybe demonstrating creation of a new child page, that type of thing.

- anthropic and openai apis

I'm considering allowing users to configure OpenAI and Anthropic API keys and for the app to use those APIs directly instead of the OpenRouter API. This is because a lot of potential users will have keys for those services, they're not necessarily OpenAI, sorry, OpenRouter customers. What do you think? Is this going to introduce a lot of complexity? I'd imagine we need to introduce a pluggable model provider and then settings to control which you're using. Probably we want to add the key management into the UI alongside the selection of your model provider. Will we be able to use features like streaming interchangeably on those different providers? Our users here are many more parameters. What do you think? We want to add a copy of these features as a custom tool. We want to add a copy of these features of the device. We want to add a copy of these features that we have as a custom tool for the device. We want to add a copy of these features. The price of a custom tool is a source of what we need to build and turn it into the device.


Please add a placeholder title to the page while it's generating, before the content starts streaming. Above the spinner.

- Starred pages
- edit markdown
- Dark mode
- disambiguation, e.g. Port, Field (maybe have the LLM proactively generate disambiguated links)
- rename costs.json to requests.json and include any user-provided input in its complete form, not just promptExcerpt

Currently 



- Security, let's look at all the best practices like disabling install scripts.



# After launch

- Settings: default detail level for new pages
- Can we improve the smoothness of back navigation by, instead of refreshing, preemptively changing the link colour before we navigate?
- Add a copy button that copies the markdown from any page. It should appear as a nice copy icon that's on the same line as the title, aligned with the right of the page.
- Full text search
