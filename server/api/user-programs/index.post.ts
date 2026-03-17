defineRouteMeta({
  openAPI: {
    tags: ['User Programs'],
    summary: 'Save a program',
    description: 'Saves a program to the authenticated user\'s library. Returns 409 if already saved.',
    responses: {
      201: { description: 'Program saved successfully' },
      400: { description: 'Missing programId' },
      404: { description: 'Program not found' },
      409: { description: 'Program already saved' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const body = await readBody(event)

  if (!body?.programId?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing programId' })
  }

  const programId = body.programId.trim()

  try {
    const program = await prisma.program.findUnique({ where: { id: programId } })
    if (!program) {
      throw createError({ statusCode: 404, statusMessage: 'Program not found' })
    }

    const userProgram = await prisma.userProgram.create({
      data: { userId, programId },
      include: {
        program: { select: { id: true, name: true, description: true } },
      },
    })

    event.node.res.statusCode = 201
    return userProgram
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    if ((error as { code?: string }).code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Program already saved' })
    }
    console.error('[POST /api/user-programs] Failed to save program', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save program' })
  }
})
