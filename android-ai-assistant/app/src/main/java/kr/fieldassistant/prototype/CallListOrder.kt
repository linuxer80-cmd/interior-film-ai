package kr.fieldassistant.prototype

/** Known recording times come first; unknown times keep their original newest-added order. */
internal object CallListOrder {
    fun indicesNewestFirst(recordedAt:List<Long>):List<Int> = recordedAt.indices.sortedWith(
        compareByDescending<Int> { recordedAt[it].takeIf { value -> value>0 } ?: Long.MIN_VALUE }
            .thenByDescending { it }
    )
}
